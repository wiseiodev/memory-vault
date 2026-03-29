import 'server-only';

import { EMBEDDING_DIMENSIONS } from '@/db/columns';
import { embedDocumentTextValues, embedQueryText } from '@/lib/ai/embeddings';
import {
  createRetrievalRepository,
  type RetrievalRepository,
} from './repository';
import type { RetrievalCandidate, SearchSegmentsInput } from './types';

type EmbeddingDeps = {
  embedDocumentTextValues: typeof embedDocumentTextValues;
  embedQueryText: typeof embedQueryText;
  repository: RetrievalRepository;
};

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
