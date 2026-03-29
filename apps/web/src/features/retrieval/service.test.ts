import { describe, expect, it, vi } from 'vitest';

import { EMBEDDING_DIMENSIONS } from '@/db/columns';
import {
  embedSegmentsForSourceItem,
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
    listSegmentsForSourceItem: vi.fn(),
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
