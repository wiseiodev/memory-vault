import 'server-only';

import { retrieveGroundedEvidence } from '@/features/retrieval/service';
import type {
  FusedRetrievalCandidate,
  RetrievalSourceKind,
} from '@/features/retrieval/types';
import { generateGroundedAnswer, repairGroundedAnswer } from '@/lib/ai/query';
import { getRequestLogger } from '@/lib/evlog';
import type { AskQueryEvent } from './schemas';

const MAX_PROMPT_BUNDLES = 8;
const MAX_PROMPT_EVIDENCE_CHARS = 5000;
const MAX_PROMPT_QUOTE_CHARS = 600;
const MIN_GROUNDED_BUNDLES = 2;
const MIN_TOP_RERANK_SCORE = 0.65;
const MIN_TOTAL_QUOTE_CHARS = 240;
const ANSWER_DELTA_CHARS = 200;
const ABSTAIN_MESSAGE = 'Unable to answer from the available evidence.';

type AskQueryInput = {
  capturedAfter?: Date;
  capturedBefore?: Date;
  question: string;
  sourceKinds?: RetrievalSourceKind[];
  spaceId?: string;
  userId: string;
};

type PreparedCitation = {
  bundleKey: string;
  canonicalUri: string | null;
  citationId: string;
  evidenceKind: 'memory' | 'segment';
  exactQuotes: string[];
  locators: Array<Record<string, unknown>>;
  memoryId?: string;
  promptQuote: string;
  promptQuoteChars: number;
  provenance: string;
  retrievalMeta: {
    fusionScore: number;
    primitiveSources: Array<
      'memory_text' | 'memory_vector' | 'segment_text' | 'segment_vector'
    >;
    rerankScore: number;
  };
  segmentIds: string[];
  sourceItemId: string;
  sourceKind: RetrievalSourceKind;
  sourceTitle: string | null;
};

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function splitAnswer(answerMarkdown: string) {
  const chunks: string[] = [];

  for (
    let index = 0;
    index < answerMarkdown.length;
    index += ANSWER_DELTA_CHARS
  ) {
    chunks.push(answerMarkdown.slice(index, index + ANSWER_DELTA_CHARS));
  }

  return chunks;
}

function extractCitationIds(answerMarkdown: string) {
  const matches = answerMarkdown.match(/\[(C\d+)\]/g) ?? [];

  return [...new Set(matches.map((match) => match.slice(1, -1)))];
}

function buildSourceReferences(citations: PreparedCitation[]) {
  const grouped = new Map<
    string,
    {
      canonicalUri: string | null;
      citationIds: string[];
      sourceItemId: string;
      sourceKind: PreparedCitation['sourceKind'];
      title: string | null;
    }
  >();

  for (const citation of citations) {
    const current = grouped.get(citation.sourceItemId) ?? {
      canonicalUri: citation.canonicalUri,
      citationIds: [],
      sourceItemId: citation.sourceItemId,
      sourceKind: citation.sourceKind,
      title: citation.sourceTitle,
    };

    current.citationIds.push(citation.citationId);
    grouped.set(citation.sourceItemId, current);
  }

  return [...grouped.values()];
}

function prepareCitations(bundles: FusedRetrievalCandidate[]) {
  return bundles.map((bundle, index) => {
    const promptQuote = truncateText(
      bundle.exactQuotes[0] ?? '',
      MAX_PROMPT_QUOTE_CHARS,
    );
    const provenance = [
      bundle.sourceTitle ?? 'Untitled source',
      bundle.sourceKind,
      bundle.canonicalUri ?? bundle.sourceItemId,
    ].join(' | ');

    return {
      bundleKey: bundle.bundleKey,
      canonicalUri: bundle.canonicalUri,
      citationId: `C${index + 1}`,
      evidenceKind: bundle.evidenceKind,
      exactQuotes: bundle.exactQuotes,
      locators: bundle.locators,
      memoryId: bundle.memoryId,
      promptQuote,
      promptQuoteChars: promptQuote.length,
      provenance,
      retrievalMeta: {
        fusionScore: bundle.fusionScore,
        primitiveSources: bundle.primitiveSources,
        rerankScore: bundle.rerankScore,
      },
      segmentIds: bundle.segmentIds,
      sourceItemId: bundle.sourceItemId,
      sourceKind: bundle.sourceKind,
      sourceTitle: bundle.sourceTitle,
    } satisfies PreparedCitation;
  });
}

function applyPromptBudget(citations: PreparedCitation[]) {
  const selected: PreparedCitation[] = [];
  let budget = 0;

  for (const citation of citations.slice(0, MAX_PROMPT_BUNDLES)) {
    const nextBudget =
      budget + citation.promptQuoteChars + citation.provenance.length;

    if (selected.length > 0 && nextBudget > MAX_PROMPT_EVIDENCE_CHARS) {
      continue;
    }

    selected.push(citation);
    budget = nextBudget;
  }

  return selected;
}

function hasWeakEvidence(
  citations: PreparedCitation[],
  input: { trustRerankScore: boolean },
) {
  if (citations.length < MIN_GROUNDED_BUNDLES) {
    return true;
  }

  if (
    input.trustRerankScore &&
    (citations[0]?.retrievalMeta.rerankScore ?? 0) < MIN_TOP_RERANK_SCORE
  ) {
    return true;
  }

  const totalQuoteChars = citations.reduce((sum, citation) => {
    return sum + citation.promptQuoteChars;
  }, 0);

  return totalQuoteChars < MIN_TOTAL_QUOTE_CHARS;
}

function toPromptBundles(citations: PreparedCitation[]) {
  return citations.map((citation) => ({
    canonicalUri: citation.canonicalUri,
    citationId: citation.citationId,
    exactQuotes: [citation.promptQuote],
    provenance: citation.provenance,
  }));
}

function isAnswerValidationFailure(
  answerMarkdown: string,
  allowedCitationIds: string[],
) {
  if (!answerMarkdown.trim()) {
    return true;
  }

  if (answerMarkdown.trim() === ABSTAIN_MESSAGE) {
    return false;
  }

  const citedIds = extractCitationIds(answerMarkdown);

  if (citedIds.length === 0) {
    return true;
  }

  return citedIds.some(
    (citationId) => !allowedCitationIds.includes(citationId),
  );
}

export async function* askQuery(
  input: AskQueryInput,
): AsyncGenerator<AskQueryEvent, void, void> {
  const logger = getRequestLogger();

  logger.info('query.ask.started', {
    hasCapturedAfter: Boolean(input.capturedAfter),
    hasCapturedBefore: Boolean(input.capturedBefore),
    hasSourceKinds: Boolean(input.sourceKinds?.length),
    hasSpaceId: Boolean(input.spaceId),
  });

  yield {
    phase: 'normalizing',
    type: 'status',
  };

  const evidence = await retrieveGroundedEvidence({
    capturedAfter: input.capturedAfter,
    capturedBefore: input.capturedBefore,
    question: input.question,
    sourceKinds: input.sourceKinds,
    spaceId: input.spaceId,
    userId: input.userId,
  });

  logger.info('query.ask.retrieved', {
    fusedCandidateCount: evidence.retrievalMeta.fusedCandidateCount,
    memoryHitsUsed: evidence.retrievalMeta.memoryHitsUsed,
    normalizationDegraded: evidence.retrievalMeta.normalizationDegraded,
    primitiveCounts: evidence.retrievalMeta.primitiveCounts,
    rerankDegraded: evidence.retrievalMeta.rerankDegraded,
  });

  yield {
    counts: {
      candidateCount: evidence.retrievalMeta.fusedCandidateCount,
      memoryHitsUsed: evidence.retrievalMeta.memoryHitsUsed,
    },
    phase: 'retrieving',
    type: 'status',
  };

  yield {
    counts: {
      candidateCount: evidence.bundles.length,
      memoryHitsUsed: evidence.retrievalMeta.memoryHitsUsed,
    },
    phase: 'reranking',
    type: 'status',
  };

  const preparedCitations = applyPromptBudget(
    prepareCitations(evidence.bundles),
  );

  if (preparedCitations.length === 0) {
    logger.warn('query.ask.abstained', {
      reason: 'no_grounded_evidence',
    });

    yield {
      citations: [],
      message: ABSTAIN_MESSAGE,
      reason: 'no_grounded_evidence',
      retrievalMeta: evidence.retrievalMeta,
      sourceReferences: [],
      type: 'abstained',
    };
    return;
  }

  if (
    hasWeakEvidence(preparedCitations, {
      trustRerankScore: !evidence.retrievalMeta.rerankDegraded,
    })
  ) {
    logger.warn('query.ask.abstained', {
      candidateCount: preparedCitations.length,
      reason: 'weak_evidence',
    });

    yield {
      citations: preparedCitations,
      message: ABSTAIN_MESSAGE,
      reason: 'weak_evidence',
      retrievalMeta: evidence.retrievalMeta,
      sourceReferences: buildSourceReferences(preparedCitations),
      type: 'abstained',
    };
    return;
  }

  yield {
    counts: {
      candidateCount: preparedCitations.length,
      memoryHitsUsed: evidence.retrievalMeta.memoryHitsUsed,
    },
    phase: 'answering',
    type: 'status',
  };

  const promptBundles = toPromptBundles(preparedCitations);
  const allowedCitationIds = preparedCitations.map(
    (citation) => citation.citationId,
  );
  const answer = await generateGroundedAnswer({
    bundles: promptBundles,
    question: input.question,
  });
  let answerMarkdown = answer.answerMarkdown;

  if (isAnswerValidationFailure(answerMarkdown, allowedCitationIds)) {
    const repaired = await repairGroundedAnswer({
      allowedCitationIds,
      answerMarkdown,
      question: input.question,
    });

    answerMarkdown = repaired.answerMarkdown;
  }

  if (answerMarkdown.trim() === ABSTAIN_MESSAGE) {
    logger.warn('query.ask.abstained', {
      reason: 'weak_evidence',
    });

    yield {
      citations: preparedCitations,
      message: ABSTAIN_MESSAGE,
      reason: 'weak_evidence',
      retrievalMeta: evidence.retrievalMeta,
      sourceReferences: buildSourceReferences(preparedCitations),
      type: 'abstained',
    };
    return;
  }

  if (isAnswerValidationFailure(answerMarkdown, allowedCitationIds)) {
    logger.warn('query.ask.abstained', {
      reason: 'generation_validation_failed',
    });

    yield {
      citations: preparedCitations,
      message: ABSTAIN_MESSAGE,
      reason: 'generation_validation_failed',
      retrievalMeta: evidence.retrievalMeta,
      sourceReferences: buildSourceReferences(preparedCitations),
      type: 'abstained',
    };
    return;
  }

  const citedIds = extractCitationIds(answerMarkdown);
  const citedIdSet = new Set(citedIds);
  const citedCitations = preparedCitations.filter((citation) => {
    return citedIdSet.has(citation.citationId);
  });

  for (const chunk of splitAnswer(answerMarkdown)) {
    yield {
      text: chunk,
      type: 'answer_delta',
    };
  }

  logger.info('query.ask.completed', {
    citedCitationCount: citedCitations.length,
    responseModel: answer.responseModel,
  });

  yield {
    answerMarkdown,
    citations: citedCitations,
    retrievalMeta: evidence.retrievalMeta,
    sourceReferences: buildSourceReferences(citedCitations),
    type: 'completed',
  };
}
