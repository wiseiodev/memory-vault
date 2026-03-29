import 'server-only';

import { EMBEDDING_DIMENSIONS } from '@/db/columns';
import { embedDocumentTextValues, embedQueryText } from '@/lib/ai/embeddings';
import { normalizeQueryText, rerankRetrievalCandidates } from '@/lib/ai/query';
import { getRequestLogger } from '@/lib/evlog';
import {
  createRetrievalRepository,
  type RetrievalRepository,
} from './repository';
import type {
  FusedRetrievalCandidate,
  GroundingCitation,
  MemoryRetrievalCandidate,
  RetrievalCandidate,
  RetrievalPrimitive,
  RetrieveGroundedEvidenceInput,
  RetrieveGroundedEvidenceResult,
  SearchSegmentsInput,
} from './types';

type EmbeddingDeps = {
  embedDocumentTextValues: typeof embedDocumentTextValues;
  embedQueryText: typeof embedQueryText;
  repository: RetrievalRepository;
};

type RetrievalPipelineDeps = EmbeddingDeps & {
  normalizeQueryText: typeof normalizeQueryText;
  rerankRetrievalCandidates: typeof rerankRetrievalCandidates;
};

const PRIMITIVE_LIMIT = 20;
const FUSED_LIMIT = 12;
const RERANK_LIMIT = 8;
const MIN_RERANK_SCORE = 0.55;
const RRF_K = 60;

function normalizeLimit(limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return 10;
  }

  return Math.min(Math.trunc(limit), 50);
}

function assertEmbeddingDimensions(embedding: number[]) {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected embedding length ${EMBEDDING_DIMENSIONS}, received ${embedding.length}.`,
    );
  }
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueJsonObjects(values: Array<Record<string, unknown>>) {
  const seen = new Set<string>();
  const result: Array<Record<string, unknown>> = [];

  for (const value of values) {
    const key = JSON.stringify(value);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function createPrimitiveCounts(): Record<RetrievalPrimitive, number> {
  return {
    memory_text: 0,
    memory_vector: 0,
    segment_text: 0,
    segment_vector: 0,
  };
}

function defaultRerankScore(index: number) {
  return Math.max(0.01, 0.6 - index * 0.01);
}

function validateRerankResults(
  candidateKeys: string[],
  results: Array<{ candidateKey: string }>,
) {
  const expectedKeys = new Set(candidateKeys);
  const seenKeys = new Set<string>();

  for (const result of results) {
    if (
      !expectedKeys.has(result.candidateKey) ||
      seenKeys.has(result.candidateKey)
    ) {
      return false;
    }

    seenKeys.add(result.candidateKey);
  }

  return seenKeys.size === expectedKeys.size;
}

function createSegmentBundle(
  candidate: RetrievalCandidate,
  fusionScore: number,
  primitiveSources: RetrievalPrimitive[],
): FusedRetrievalCandidate {
  return {
    bundleKey: `segment:${candidate.segmentId}`,
    candidateKey: `segment:${candidate.segmentId}`,
    canonicalUri: candidate.canonicalUri,
    exactQuotes: [candidate.content],
    evidenceKind: 'segment',
    fusionScore,
    locators: [
      {
        ...candidate.metadata,
        ordinal: candidate.ordinal,
        segmentId: candidate.segmentId,
      },
    ],
    memorySummary: null,
    primitiveSources,
    rerankScore: fusionScore,
    segmentIds: [candidate.segmentId],
    sourceItemId: candidate.sourceItemId,
    sourceKind: candidate.sourceKind,
    sourceTitle: candidate.sourceTitle,
  };
}

function createMemoryBundle(
  candidate: MemoryRetrievalCandidate,
  citations: GroundingCitation[],
  fusionScore: number,
  primitiveSources: RetrievalPrimitive[],
): FusedRetrievalCandidate | null {
  if (citations.length === 0) {
    return null;
  }

  const primaryCitation = [...citations].sort((left, right) => {
    if (left.memoryCitationOrdinal !== right.memoryCitationOrdinal) {
      return left.memoryCitationOrdinal - right.memoryCitationOrdinal;
    }

    return left.segmentOrdinal - right.segmentOrdinal;
  })[0];

  if (!primaryCitation) {
    return null;
  }

  return {
    bundleKey: `memory:${candidate.memoryId}`,
    candidateKey: `memory:${candidate.memoryId}`,
    canonicalUri: primaryCitation.canonicalUri,
    exactQuotes: uniqueStrings(
      citations.map(
        (citation) => citation.quoteText || citation.segmentContent,
      ),
    ),
    evidenceKind: 'memory',
    fusionScore,
    locators: uniqueJsonObjects(
      citations.map((citation) => ({
        ...citation.locator,
        ...citation.segmentMetadata,
        ordinal: citation.segmentOrdinal,
        segmentId: citation.segmentId,
      })),
    ),
    memoryId: candidate.memoryId,
    memorySummary: candidate.summary ?? truncateText(candidate.content, 300),
    primitiveSources,
    rerankScore: fusionScore,
    segmentIds: uniqueStrings(citations.map((citation) => citation.segmentId)),
    sourceItemId: primaryCitation.sourceItemId,
    sourceKind: primaryCitation.sourceKind,
    sourceTitle: primaryCitation.sourceTitle,
  };
}

function collapseBundles(
  segmentBundles: FusedRetrievalCandidate[],
  memoryBundles: FusedRetrievalCandidate[],
) {
  const grouped = new Map<string, FusedRetrievalCandidate[]>();

  for (const bundle of [...segmentBundles, ...memoryBundles]) {
    const primarySegmentId = bundle.segmentIds[0];
    const key = primarySegmentId
      ? `segment:${primarySegmentId}`
      : bundle.bundleKey;
    const current = grouped.get(key) ?? [];

    current.push(bundle);
    grouped.set(key, current);
  }

  return [...grouped.entries()].map(([groupKey, group]) => {
    const directSegment = group.find(
      (bundle) => bundle.evidenceKind === 'segment',
    );
    const representative =
      directSegment ??
      [...group].sort((left, right) => right.fusionScore - left.fusionScore)[0];
    const memoryIds = uniqueStrings(
      group.flatMap((bundle) => (bundle.memoryId ? [bundle.memoryId] : [])),
    );

    return {
      bundleKey: groupKey,
      candidateKey: groupKey,
      canonicalUri:
        representative.canonicalUri ??
        group.find((bundle) => bundle.canonicalUri)?.canonicalUri ??
        null,
      exactQuotes: uniqueStrings(group.flatMap((bundle) => bundle.exactQuotes)),
      evidenceKind: directSegment ? 'segment' : representative.evidenceKind,
      fusionScore: group.reduce(
        (total, bundle) => total + bundle.fusionScore,
        0,
      ),
      locators: uniqueJsonObjects(group.flatMap((bundle) => bundle.locators)),
      memoryId: memoryIds.length === 1 ? memoryIds[0] : undefined,
      memorySummary:
        group.find((bundle) => bundle.memorySummary)?.memorySummary ?? null,
      primitiveSources: uniqueStrings(
        group.flatMap((bundle) => bundle.primitiveSources),
      ) as RetrievalPrimitive[],
      rerankScore: representative.rerankScore,
      segmentIds: uniqueStrings(group.flatMap((bundle) => bundle.segmentIds)),
      sourceItemId: representative.sourceItemId,
      sourceKind: representative.sourceKind,
      sourceTitle: representative.sourceTitle,
    } satisfies FusedRetrievalCandidate;
  });
}

export async function embedSegmentsForSourceItem(
  input: { embeddedAt: Date; force?: boolean; sourceItemId: string },
  deps: EmbeddingDeps = {
    embedDocumentTextValues,
    embedQueryText,
    repository: createRetrievalRepository(),
  },
) {
  const segments = await deps.repository.listSegmentsForSourceItem({
    force: input.force,
    sourceItemId: input.sourceItemId,
  });

  if (segments.length === 0) {
    return {
      embeddedCount: 0,
      model: null,
      sourceItemId: input.sourceItemId,
    };
  }

  const orderedSegments = [...segments].sort((left, right) => {
    return left.ordinal - right.ordinal;
  });

  const result = await deps.embedDocumentTextValues({
    values: orderedSegments.map((segment) => segment.content),
  });

  if (result.embeddings.length !== orderedSegments.length) {
    throw new Error(
      `Expected ${orderedSegments.length} embeddings, received ${result.embeddings.length}.`,
    );
  }

  for (const embedding of result.embeddings) {
    assertEmbeddingDimensions(embedding);
  }

  await deps.repository.updateSegmentEmbeddings({
    embeddedAt: input.embeddedAt,
    embeddings: orderedSegments.map((segment, index) => ({
      embedding: result.embeddings[index] ?? [],
      embeddingModel: result.model,
      segmentId: segment.id,
    })),
  });

  return {
    embeddedCount: orderedSegments.length,
    model: result.model,
    sourceItemId: input.sourceItemId,
  };
}

export async function searchMemoriesByText(
  input: SearchSegmentsInput,
  deps: Pick<EmbeddingDeps, 'repository'> = {
    repository: createRetrievalRepository(),
  },
): Promise<MemoryRetrievalCandidate[]> {
  const query = input.query.trim();

  if (!query) {
    return [];
  }

  return deps.repository.searchMemoriesByText({
    ...input,
    limit: normalizeLimit(input.limit),
    query,
  });
}

export async function searchMemoriesByVector(
  input: SearchSegmentsInput,
  deps: EmbeddingDeps = {
    embedDocumentTextValues,
    embedQueryText,
    repository: createRetrievalRepository(),
  },
): Promise<MemoryRetrievalCandidate[]> {
  const query = input.query.trim();

  if (!query) {
    return [];
  }

  const result = await deps.embedQueryText({
    value: query,
  });

  assertEmbeddingDimensions(result.embedding);

  return deps.repository.searchMemoriesByVector({
    capturedAfter: input.capturedAfter,
    capturedBefore: input.capturedBefore,
    limit: normalizeLimit(input.limit),
    queryEmbedding: result.embedding,
    sourceKinds: input.sourceKinds,
    spaceId: input.spaceId,
    userId: input.userId,
  });
}

export async function searchSegmentsByText(
  input: SearchSegmentsInput,
  deps: Pick<EmbeddingDeps, 'repository'> = {
    repository: createRetrievalRepository(),
  },
): Promise<RetrievalCandidate[]> {
  const query = input.query.trim();

  if (!query) {
    return [];
  }

  return deps.repository.searchSegmentsByText({
    ...input,
    limit: normalizeLimit(input.limit),
    query,
  });
}

export async function searchSegmentsByVector(
  input: SearchSegmentsInput,
  deps: EmbeddingDeps = {
    embedDocumentTextValues,
    embedQueryText,
    repository: createRetrievalRepository(),
  },
): Promise<RetrievalCandidate[]> {
  const query = input.query.trim();

  if (!query) {
    return [];
  }

  const result = await deps.embedQueryText({
    value: query,
  });

  assertEmbeddingDimensions(result.embedding);

  return deps.repository.searchSegmentsByVector({
    capturedAfter: input.capturedAfter,
    capturedBefore: input.capturedBefore,
    limit: normalizeLimit(input.limit),
    queryEmbedding: result.embedding,
    sourceKinds: input.sourceKinds,
    spaceId: input.spaceId,
    userId: input.userId,
  });
}

export async function retrieveGroundedEvidence(
  input: RetrieveGroundedEvidenceInput,
  deps: RetrievalPipelineDeps = {
    embedDocumentTextValues,
    embedQueryText,
    normalizeQueryText,
    repository: createRetrievalRepository(),
    rerankRetrievalCandidates,
  },
): Promise<RetrieveGroundedEvidenceResult> {
  const logger = getRequestLogger();
  const question = input.question.trim();
  let retrievalQuery = question;
  let normalizationDegraded = false;
  let rerankDegraded = false;
  let usedNormalizedQuery = false;

  if (!question) {
    return {
      bundles: [],
      retrievalMeta: {
        fusedCandidateCount: 0,
        memoryHitsUsed: false,
        normalizationDegraded: true,
        primitiveCounts: createPrimitiveCounts(),
        rerankDegraded: false,
        retrievalQuery: '',
        usedNormalizedQuery: false,
      },
    };
  }

  try {
    const normalized = await deps.normalizeQueryText({
      question,
    });
    const normalizedQuery = normalized.normalizedQuery.trim();

    if (normalizedQuery && normalizedQuery !== question) {
      retrievalQuery = normalizedQuery;
      usedNormalizedQuery = true;
    }
  } catch (error) {
    normalizationDegraded = true;
    logger.warn('query.normalization.degraded', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }

  const searchInput = {
    capturedAfter: input.capturedAfter,
    capturedBefore: input.capturedBefore,
    limit: PRIMITIVE_LIMIT,
    query: retrievalQuery,
    sourceKinds: input.sourceKinds,
    spaceId: input.spaceId,
    userId: input.userId,
  } satisfies SearchSegmentsInput;

  const settledResults = await Promise.allSettled([
    searchSegmentsByText(searchInput, deps),
    searchMemoriesByText(searchInput, deps),
    deps.embedQueryText({ value: retrievalQuery }).then((result) => {
      assertEmbeddingDimensions(result.embedding);

      return Promise.all([
        deps.repository.searchSegmentsByVector({
          capturedAfter: input.capturedAfter,
          capturedBefore: input.capturedBefore,
          limit: PRIMITIVE_LIMIT,
          queryEmbedding: result.embedding,
          sourceKinds: input.sourceKinds,
          spaceId: input.spaceId,
          userId: input.userId,
        }),
        deps.repository.searchMemoriesByVector({
          capturedAfter: input.capturedAfter,
          capturedBefore: input.capturedBefore,
          limit: PRIMITIVE_LIMIT,
          queryEmbedding: result.embedding,
          sourceKinds: input.sourceKinds,
          spaceId: input.spaceId,
          userId: input.userId,
        }),
      ]);
    }),
  ]);

  const primitiveCounts = createPrimitiveCounts();

  const segmentText =
    settledResults[0].status === 'fulfilled' ? settledResults[0].value : [];
  primitiveCounts.segment_text = segmentText.length;

  const memoryText =
    settledResults[1].status === 'fulfilled' ? settledResults[1].value : [];
  primitiveCounts.memory_text = memoryText.length;

  const vectorResults =
    settledResults[2].status === 'fulfilled' ? settledResults[2].value : [];
  const segmentVector = vectorResults[0] ?? [];
  primitiveCounts.segment_vector = segmentVector.length;

  if (settledResults[2].status === 'rejected') {
    logger.warn('query.retrieval.segment_vector.degraded', {
      reason:
        settledResults[2].reason instanceof Error
          ? settledResults[2].reason.message
          : 'unknown',
    });
    logger.warn('query.retrieval.memory_vector.degraded', {
      reason:
        settledResults[2].reason instanceof Error
          ? settledResults[2].reason.message
          : 'unknown',
    });
  }
  const memoryVector = vectorResults[1] ?? [];
  primitiveCounts.memory_vector = memoryVector.length;

  const primitiveRanks = new Map<
    string,
    { primitives: Set<RetrievalPrimitive>; score: number }
  >();
  const addRankedCandidates = <
    T extends { memoryId?: string; segmentId?: string },
  >(
    primitive: RetrievalPrimitive,
    candidates: T[],
  ) => {
    candidates.forEach((candidate, index) => {
      const candidateKey =
        'segmentId' in candidate && candidate.segmentId
          ? `segment:${candidate.segmentId}`
          : `memory:${candidate.memoryId}`;
      const current = primitiveRanks.get(candidateKey) ?? {
        primitives: new Set<RetrievalPrimitive>(),
        score: 0,
      };

      current.primitives.add(primitive);
      current.score += 1 / (RRF_K + index + 1);
      primitiveRanks.set(candidateKey, current);
    });
  };

  addRankedCandidates('segment_text', segmentText);
  addRankedCandidates('segment_vector', segmentVector);
  addRankedCandidates('memory_text', memoryText);
  addRankedCandidates('memory_vector', memoryVector);

  const memoryIds = uniqueStrings(
    [...memoryText, ...memoryVector].map((candidate) => candidate.memoryId),
  );
  let citations: GroundingCitation[] = [];

  try {
    citations = await deps.repository.listGroundingCitationsForMemories({
      capturedAfter: input.capturedAfter,
      capturedBefore: input.capturedBefore,
      memoryIds,
      sourceKinds: input.sourceKinds,
      spaceId: input.spaceId,
      userId: input.userId,
    });
  } catch (error) {
    logger.warn('query.retrieval.memory_citations.degraded', {
      memoryCount: memoryIds.length,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }

  const citationsByMemoryId = new Map<string, GroundingCitation[]>();

  for (const citation of citations) {
    const current = citationsByMemoryId.get(citation.memoryId) ?? [];
    current.push(citation);
    citationsByMemoryId.set(citation.memoryId, current);
  }

  const segmentBundles = uniqueStrings(
    [...segmentText, ...segmentVector].map((candidate) => candidate.segmentId),
  )
    .map((segmentId) => {
      const candidate = [...segmentText, ...segmentVector].find(
        (currentCandidate) => currentCandidate.segmentId === segmentId,
      );

      if (!candidate) {
        return null;
      }

      const rank = primitiveRanks.get(`segment:${segmentId}`);

      return createSegmentBundle(candidate, rank?.score ?? 0, [
        ...(rank?.primitives ?? new Set<RetrievalPrimitive>()),
      ]);
    })
    .filter((bundle): bundle is FusedRetrievalCandidate => bundle !== null);

  const memoryBundles = uniqueStrings(
    [...memoryText, ...memoryVector].map((candidate) => candidate.memoryId),
  )
    .map((memoryId) => {
      const candidate = [...memoryText, ...memoryVector].find(
        (currentCandidate) => currentCandidate.memoryId === memoryId,
      );

      if (!candidate) {
        return null;
      }

      const rank = primitiveRanks.get(`memory:${memoryId}`);

      return createMemoryBundle(
        candidate,
        citationsByMemoryId.get(memoryId) ?? [],
        rank?.score ?? 0,
        [...(rank?.primitives ?? new Set<RetrievalPrimitive>())],
      );
    })
    .filter((bundle): bundle is FusedRetrievalCandidate => bundle !== null);

  const fusedBundles = collapseBundles(segmentBundles, memoryBundles)
    .filter(
      (bundle) => bundle.exactQuotes.length > 0 && bundle.segmentIds.length > 0,
    )
    .sort((left, right) => right.fusionScore - left.fusionScore)
    .slice(0, FUSED_LIMIT);

  if (fusedBundles.length === 0) {
    return {
      bundles: [],
      retrievalMeta: {
        fusedCandidateCount: 0,
        memoryHitsUsed: false,
        normalizationDegraded,
        primitiveCounts,
        rerankDegraded: false,
        retrievalQuery,
        usedNormalizedQuery,
      },
    };
  }

  let rerankedBundles = fusedBundles.map((bundle, index) => ({
    ...bundle,
    rerankScore: defaultRerankScore(index),
  }));

  try {
    const rerank = await deps.rerankRetrievalCandidates({
      candidates: fusedBundles.map((bundle) => ({
        candidateKey: bundle.candidateKey,
        canonicalUri: bundle.canonicalUri,
        excerpt: truncateText(bundle.exactQuotes[0] ?? '', 600),
        memorySummary: bundle.memorySummary
          ? truncateText(bundle.memorySummary, 300)
          : null,
        sourceKind: bundle.sourceKind,
        title: bundle.sourceTitle,
      })),
      question,
    });

    if (
      !validateRerankResults(
        fusedBundles.map((bundle) => bundle.candidateKey),
        rerank.results,
      )
    ) {
      throw new Error(
        'Reranker returned an incomplete or invalid candidate set.',
      );
    }

    const scoresByKey = new Map(
      rerank.results.map((result) => [
        result.candidateKey,
        { rationale: result.rationale, score: result.score },
      ]),
    );

    rerankedBundles = fusedBundles
      .map((bundle) => {
        const reranked = scoresByKey.get(bundle.candidateKey);

        return {
          ...bundle,
          rerankRationale: reranked?.rationale ?? null,
          rerankScore: reranked?.score ?? 0,
        };
      })
      .filter((bundle) => bundle.rerankScore >= MIN_RERANK_SCORE)
      .sort((left, right) => right.rerankScore - left.rerankScore)
      .slice(0, RERANK_LIMIT);
  } catch (error) {
    rerankDegraded = true;
    logger.warn('query.rerank.degraded', {
      candidateCount: fusedBundles.length,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }

  return {
    bundles: rerankedBundles,
    retrievalMeta: {
      fusedCandidateCount: fusedBundles.length,
      memoryHitsUsed: rerankedBundles.some((bundle) =>
        Boolean(bundle.memoryId),
      ),
      normalizationDegraded,
      primitiveCounts,
      rerankDegraded,
      retrievalQuery,
      usedNormalizedQuery,
    },
  };
}
