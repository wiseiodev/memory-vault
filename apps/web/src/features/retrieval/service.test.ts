import { describe, expect, it, vi } from 'vitest';

import { EMBEDDING_DIMENSIONS } from '@/db/columns';

const requestLogger = {
  warn: vi.fn(),
};

vi.mock('@/lib/evlog', () => ({
  getRequestLogger: vi.fn(() => requestLogger),
}));

import {
  embedSegmentsForSourceItem,
  retrieveGroundedEvidence,
  searchMemoriesByText,
  searchSegmentsByText,
  searchSegmentsByVector,
} from './service';

function createEmbedding(seed: number) {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_value, index) => {
    return seed + index / 10_000;
  });
}

function createRepositoryMocks() {
  return {
    listGroundingCitationsForMemories: vi.fn(),
    listSegmentsForSourceItem: vi.fn(),
    searchMemoriesByText: vi.fn(),
    searchMemoriesByVector: vi.fn(),
    searchSegmentsByText: vi.fn(),
    searchSegmentsByVector: vi.fn(),
    updateSegmentEmbeddings: vi.fn(),
  };
}

describe('embedSegmentsForSourceItem', () => {
  it('embeds ordered segments and persists model metadata', async () => {
    const repository = createRepositoryMocks();
    repository.listSegmentsForSourceItem.mockResolvedValue([
      {
        content: 'Second segment',
        id: 'seg_2',
        ordinal: 2,
      },
      {
        content: 'First segment',
        id: 'seg_1',
        ordinal: 1,
      },
    ]);

    const result = await embedSegmentsForSourceItem(
      {
        embeddedAt: new Date('2026-03-29T10:00:00.000Z'),
        force: true,
        sourceItemId: 'src_123',
      },
      {
        embedDocumentTextValues: vi.fn(async ({ values }) => {
          expect(values).toEqual(['First segment', 'Second segment']);

          return {
            embeddings: [createEmbedding(1), createEmbedding(2)],
            model: 'google/gemini-embedding-2',
          };
        }),
        embedQueryText: vi.fn(),
        repository,
      },
    );

    expect(repository.listSegmentsForSourceItem).toHaveBeenCalledWith({
      force: true,
      sourceItemId: 'src_123',
    });
    expect(repository.updateSegmentEmbeddings).toHaveBeenCalledWith({
      embeddedAt: new Date('2026-03-29T10:00:00.000Z'),
      embeddings: [
        {
          embedding: createEmbedding(1),
          embeddingModel: 'google/gemini-embedding-2',
          segmentId: 'seg_1',
        },
        {
          embedding: createEmbedding(2),
          embeddingModel: 'google/gemini-embedding-2',
          segmentId: 'seg_2',
        },
      ],
    });
    expect(result).toEqual({
      embeddedCount: 2,
      model: 'google/gemini-embedding-2',
      sourceItemId: 'src_123',
    });
  });

  it('returns early when there are no segments to embed', async () => {
    const repository = createRepositoryMocks();
    repository.listSegmentsForSourceItem.mockResolvedValue([]);

    const result = await embedSegmentsForSourceItem(
      {
        embeddedAt: new Date('2026-03-29T10:00:00.000Z'),
        sourceItemId: 'src_123',
      },
      {
        embedDocumentTextValues: vi.fn(),
        embedQueryText: vi.fn(),
        repository,
      },
    );

    expect(repository.updateSegmentEmbeddings).not.toHaveBeenCalled();
    expect(result).toEqual({
      embeddedCount: 0,
      model: null,
      sourceItemId: 'src_123',
    });
  });

  it('rejects embeddings that do not match the configured dimension size', async () => {
    const repository = createRepositoryMocks();
    repository.listSegmentsForSourceItem.mockResolvedValue([
      {
        content: 'Only segment',
        id: 'seg_1',
        ordinal: 1,
      },
    ]);

    await expect(
      embedSegmentsForSourceItem(
        {
          embeddedAt: new Date('2026-03-29T10:00:00.000Z'),
          sourceItemId: 'src_123',
        },
        {
          embedDocumentTextValues: vi.fn(async () => ({
            embeddings: [[1, 2, 3]],
            model: 'google/gemini-embedding-2',
          })),
          embedQueryText: vi.fn(),
          repository,
        },
      ),
    ).rejects.toThrow(
      `Expected embedding length ${EMBEDDING_DIMENSIONS}, received 3.`,
    );

    expect(repository.updateSegmentEmbeddings).not.toHaveBeenCalled();
  });
});

describe('searchSegmentsByText', () => {
  it('returns an empty result for blank queries', async () => {
    const repository = createRepositoryMocks();

    const result = await searchSegmentsByText(
      {
        limit: 10,
        query: '   ',
        userId: 'user_123',
      },
      { repository },
    );

    expect(result).toEqual([]);
    expect(repository.searchSegmentsByText).not.toHaveBeenCalled();
  });
});

describe('searchMemoriesByText', () => {
  it('returns an empty result for blank queries', async () => {
    const repository = createRepositoryMocks();

    const result = await searchMemoriesByText(
      {
        limit: 10,
        query: '   ',
        userId: 'user_123',
      },
      { repository },
    );

    expect(result).toEqual([]);
    expect(repository.searchMemoriesByText).not.toHaveBeenCalled();
  });
});

describe('searchSegmentsByVector', () => {
  it('embeds the query and delegates to vector retrieval with a normalized limit', async () => {
    const repository = createRepositoryMocks();
    repository.searchSegmentsByVector.mockResolvedValue([
      {
        canonicalUri: 'https://example.com',
        content: 'Remember this',
        effectiveSourceAt: new Date('2026-03-29T10:00:00.000Z'),
        metadata: {},
        ordinal: 1,
        retrievalMode: 'vector',
        score: 0.92,
        segmentId: 'seg_1',
        segmentKind: 'plain_text',
        sourceBlobId: null,
        sourceItemId: 'src_123',
        sourceKind: 'note',
        sourceTitle: 'My note',
      },
    ]);

    const result = await searchSegmentsByVector(
      {
        limit: 999,
        query: 'find my note',
        sourceKinds: ['note'],
        spaceId: 'spc_123',
        userId: 'user_123',
      },
      {
        embedDocumentTextValues: vi.fn(),
        embedQueryText: vi.fn(async ({ value }) => {
          expect(value).toBe('find my note');

          return {
            embedding: createEmbedding(3),
            model: 'google/gemini-embedding-2',
          };
        }),
        repository,
      },
    );

    expect(repository.searchSegmentsByVector).toHaveBeenCalledWith({
      capturedAfter: undefined,
      capturedBefore: undefined,
      limit: 50,
      queryEmbedding: createEmbedding(3),
      sourceKinds: ['note'],
      spaceId: 'spc_123',
      userId: 'user_123',
    });
    expect(result).toHaveLength(1);
  });
});

describe('retrieveGroundedEvidence', () => {
  it('degrades normalization, vector retrieval, and reranking while collapsing overlapping evidence', async () => {
    const repository = createRepositoryMocks();
    repository.searchSegmentsByText.mockResolvedValue([
      {
        canonicalUri: 'https://example.com/note',
        content: 'Pack the charger before leaving.',
        effectiveSourceAt: new Date('2026-03-29T10:00:00.000Z'),
        metadata: { page: 1 },
        ordinal: 1,
        retrievalMode: 'text',
        score: 0.91,
        segmentId: 'seg_1',
        segmentKind: 'plain_text',
        sourceBlobId: null,
        sourceItemId: 'src_1',
        sourceKind: 'note',
        sourceTitle: 'Trip note',
      },
    ]);
    repository.searchSegmentsByVector.mockRejectedValue(
      new Error('embedding unavailable'),
    );
    repository.searchMemoriesByText.mockResolvedValue([
      {
        canonicalUri: null,
        confidence: 0.8,
        content: 'Remember to pack the charger.',
        createdAt: new Date('2026-03-29T09:00:00.000Z'),
        memoryId: 'mem_1',
        score: 0.83,
        summary: 'Pack the charger.',
        title: 'Packing memory',
        updatedAt: new Date('2026-03-29T10:00:00.000Z'),
      },
    ]);
    repository.searchMemoriesByVector.mockResolvedValue([]);
    repository.listGroundingCitationsForMemories.mockResolvedValue([
      {
        canonicalUri: 'https://example.com/note',
        locator: { page: 1 },
        memoryCitationOrdinal: 1,
        memoryId: 'mem_1',
        quoteText: 'Pack the charger before leaving.',
        segmentContent: 'Pack the charger before leaving.',
        segmentId: 'seg_1',
        segmentMetadata: { page: 1 },
        segmentOrdinal: 1,
        sourceItemId: 'src_1',
        sourceKind: 'note',
        sourceTitle: 'Trip note',
      },
    ]);

    const result = await retrieveGroundedEvidence(
      {
        question: 'what do i need to pack?',
        userId: 'user_123',
      },
      {
        embedDocumentTextValues: vi.fn(),
        embedQueryText: vi.fn(async () => {
          throw new Error('should not call memory vector in this test');
        }),
        normalizeQueryText: vi.fn(async () => {
          throw new Error('normalization failed');
        }),
        repository,
        rerankRetrievalCandidates: vi.fn(async () => {
          throw new Error('rerank failed');
        }),
      },
    );

    expect(result.bundles).toHaveLength(1);
    expect(result.bundles[0]).toEqual(
      expect.objectContaining({
        bundleKey: 'segment:seg_1',
        memoryId: 'mem_1',
        primitiveSources: expect.arrayContaining([
          'memory_text',
          'segment_text',
        ]),
        sourceItemId: 'src_1',
      }),
    );
    expect(result.retrievalMeta.normalizationDegraded).toBe(true);
    expect(result.retrievalMeta.rerankDegraded).toBe(true);
    expect(result.retrievalMeta.primitiveCounts.segment_vector).toBe(0);
  });

  it('falls back atomically when the reranker omits candidates', async () => {
    const repository = createRepositoryMocks();
    repository.searchSegmentsByText.mockResolvedValue([
      {
        canonicalUri: 'https://example.com/note-1',
        content: 'Pack the charger before leaving.',
        effectiveSourceAt: new Date('2026-03-29T10:00:00.000Z'),
        metadata: { page: 1 },
        ordinal: 1,
        retrievalMode: 'text',
        score: 0.91,
        segmentId: 'seg_1',
        segmentKind: 'plain_text',
        sourceBlobId: null,
        sourceItemId: 'src_1',
        sourceKind: 'note',
        sourceTitle: 'Trip note',
      },
      {
        canonicalUri: 'https://example.com/note-2',
        content: 'Bring your passport to the appointment.',
        effectiveSourceAt: new Date('2026-03-29T10:00:00.000Z'),
        metadata: { page: 2 },
        ordinal: 2,
        retrievalMode: 'text',
        score: 0.89,
        segmentId: 'seg_2',
        segmentKind: 'plain_text',
        sourceBlobId: null,
        sourceItemId: 'src_2',
        sourceKind: 'note',
        sourceTitle: 'Renewal note',
      },
    ]);
    repository.searchSegmentsByVector.mockResolvedValue([]);
    repository.searchMemoriesByText.mockResolvedValue([]);
    repository.searchMemoriesByVector.mockResolvedValue([]);
    repository.listGroundingCitationsForMemories.mockResolvedValue([]);

    const result = await retrieveGroundedEvidence(
      {
        question: 'what should i bring?',
        userId: 'user_123',
      },
      {
        embedDocumentTextValues: vi.fn(),
        embedQueryText: vi.fn(async () => ({
          embedding: createEmbedding(1),
          model: 'google/gemini-embedding-2',
        })),
        normalizeQueryText: vi.fn(async () => ({
          configuredModel: 'google/gemini-3-flash',
          normalizedQuery: 'what should i bring?',
          providerRoute: ['google/gemini-3-flash'],
          responseModel: 'google/gemini-3-flash',
        })),
        repository,
        rerankRetrievalCandidates: vi.fn(async () => ({
          configuredModel: 'google/gemini-3-flash',
          providerRoute: ['google/gemini-3-flash'],
          responseModel: 'google/gemini-3-flash',
          results: [
            {
              candidateKey: 'segment:seg_1',
              rationale: 'Matches packing context.',
              score: 0.92,
            },
          ],
        })),
      },
    );

    expect(result.retrievalMeta.rerankDegraded).toBe(true);
    expect(result.bundles.map((bundle) => bundle.segmentIds[0])).toEqual([
      'seg_1',
      'seg_2',
    ]);
  });

  it('reuses one query embedding for both vector retrieval branches', async () => {
    const repository = createRepositoryMocks();
    repository.searchSegmentsByText.mockResolvedValue([]);
    repository.searchSegmentsByVector.mockResolvedValue([]);
    repository.searchMemoriesByText.mockResolvedValue([]);
    repository.searchMemoriesByVector.mockResolvedValue([]);
    repository.listGroundingCitationsForMemories.mockResolvedValue([]);
    const embedQuery = vi.fn(async () => ({
      embedding: createEmbedding(7),
      model: 'google/gemini-embedding-2',
    }));

    await retrieveGroundedEvidence(
      {
        question: 'what should i bring?',
        userId: 'user_123',
      },
      {
        embedDocumentTextValues: vi.fn(),
        embedQueryText: embedQuery,
        normalizeQueryText: vi.fn(async () => ({
          configuredModel: 'google/gemini-3-flash',
          normalizedQuery: 'what should i bring?',
          providerRoute: ['google/gemini-3-flash'],
          responseModel: 'google/gemini-3-flash',
        })),
        repository,
        rerankRetrievalCandidates: vi.fn(),
      },
    );

    expect(embedQuery).toHaveBeenCalledTimes(1);
    expect(repository.searchSegmentsByVector).toHaveBeenCalledWith({
      capturedAfter: undefined,
      capturedBefore: undefined,
      limit: 20,
      queryEmbedding: createEmbedding(7),
      sourceKinds: undefined,
      spaceId: undefined,
      userId: 'user_123',
    });
    expect(repository.searchMemoriesByVector).toHaveBeenCalledWith({
      capturedAfter: undefined,
      capturedBefore: undefined,
      limit: 20,
      queryEmbedding: createEmbedding(7),
      sourceKinds: undefined,
      spaceId: undefined,
      userId: 'user_123',
    });
  });
});
