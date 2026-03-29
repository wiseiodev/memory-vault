import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import { EMBEDDING_DIMENSIONS, serializeVector } from '@/db/columns';
import { createRetrievalRepository } from './repository';

function createEmbedding(seed: number) {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_value, index) => {
    return seed + index / 10_000;
  });
}

function createDbMock(
  responses: Array<{ rowCount?: number; rows: unknown[] }> = [{ rows: [] }],
) {
  const execute = vi.fn(async () => {
    const nextResponse = responses.shift();
    return nextResponse ?? { rows: [], rowCount: 0 };
  });
  const transaction = vi.fn(async (callback) => {
    return callback({
      execute,
    });
  });

  return {
    db: {
      execute,
      transaction,
    } as never,
    execute,
    transaction,
  };
}

function compileQuery(query: SQL) {
  return new PgDialect().sqlToQuery(query);
}

function getExecutedQuery(execute: ReturnType<typeof vi.fn>, index = 0) {
  const call = execute.mock.calls[index];

  if (!call) {
    throw new Error(`Expected execute() call at index ${index}.`);
  }

  const [query] = call;

  return query as SQL;
}

describe('createRetrievalRepository', () => {
  it('filters unembedded active segments by default when loading segments for indexing', async () => {
    const { db, execute } = createDbMock([
      {
        rows: [{ content: 'Remember this', id: 'seg_1', ordinal: 1 }],
      },
    ]);
    const repository = createRetrievalRepository(db);

    await repository.listSegmentsForSourceItem({
      sourceItemId: 'src_123',
    });

    const query = compileQuery(getExecutedQuery(execute));

    expect(query.sql).toContain('"segments"."embedding" is null');
    expect(query.sql).toContain('"segments"."archived_at" is null');
    expect(query.sql).toContain('order by "segments"."ordinal" asc');
  });

  it('omits the null-embedding filter when force re-embedding is requested', async () => {
    const { db, execute } = createDbMock();
    const repository = createRetrievalRepository(db);

    await repository.listSegmentsForSourceItem({
      force: true,
      sourceItemId: 'src_123',
    });

    const query = compileQuery(getExecutedQuery(execute));

    expect(query.sql).not.toContain('"segments"."embedding" is null');
  });

  it('builds the expected full-text search query and maps rows', async () => {
    const { db, execute } = createDbMock([
      {
        rows: [
          {
            canonicalUri: 'https://example.com',
            content: 'Pack charger',
            effectiveSourceAt: '2026-03-29T10:00:00.000Z',
            metadata: { page: 1 },
            ordinal: 1,
            score: '0.75',
            segmentId: 'seg_1',
            segmentKind: 'plain_text',
            sourceBlobId: null,
            sourceItemId: 'src_123',
            sourceKind: 'note',
            sourceTitle: 'Weekend prep',
          },
        ],
      },
    ]);
    const repository = createRetrievalRepository(db);

    const result = await repository.searchSegmentsByText({
      capturedAfter: new Date('2026-03-01T00:00:00.000Z'),
      limit: 5,
      query: 'charger',
      sourceKinds: ['note', 'file'],
      spaceId: 'spc_123',
      userId: 'user_123',
    });

    const query = compileQuery(getExecutedQuery(execute));

    expect(query.sql).toContain("websearch_to_tsquery('simple'");
    expect(query.sql).toContain('ts_rank_cd(');
    expect(query.sql).toContain('"spaces"."owner_user_id" =');
    expect(query.sql).toContain('"source_items"."status" =');
    expect(query.sql).toContain(
      'coalesce("source_items"."captured_at", "source_items"."created_at") >=',
    );
    expect(query.params).toEqual(
      expect.arrayContaining([
        'charger',
        'spc_123',
        'user_123',
        'note',
        'file',
      ]),
    );
    expect(result).toEqual([
      expect.objectContaining({
        effectiveSourceAt: new Date('2026-03-29T10:00:00.000Z'),
        retrievalMode: 'text',
        score: 0.75,
        segmentId: 'seg_1',
      }),
    ]);
  });

  it('builds the expected vector search query', async () => {
    const { db, execute } = createDbMock([{ rows: [] }]);
    const repository = createRetrievalRepository(db);

    await repository.searchSegmentsByVector({
      limit: 3,
      queryEmbedding: createEmbedding(1),
      userId: 'user_123',
    });

    const query = compileQuery(getExecutedQuery(execute));

    expect(query.sql).toContain('<=>');
    expect(query.sql).toContain('::vector');
    expect(query.sql).toContain('"segments"."embedding" is not null');
    expect(query.sql).toContain('greatest(0, least(1, 1 - ((');
    expect(query.sql).toContain('order by');
    expect(query.params).toEqual(
      expect.arrayContaining([
        serializeVector(createEmbedding(1)),
        'user_123',
        3,
      ]),
    );
  });

  it('builds the expected memory full-text search query with citation path filtering', async () => {
    const { db, execute } = createDbMock([
      {
        rows: [
          {
            canonicalUri: null,
            confidence: '0.8',
            content: 'Remember the passport appointment.',
            createdAt: '2026-03-29T10:00:00.000Z',
            memoryId: 'mem_1',
            score: '0.72',
            summary: 'Passport appointment',
            title: 'Renewal',
            updatedAt: '2026-03-29T12:00:00.000Z',
          },
        ],
      },
    ]);
    const repository = createRetrievalRepository(db);

    const result = await repository.searchMemoriesByText({
      capturedBefore: new Date('2026-04-01T00:00:00.000Z'),
      limit: 5,
      query: 'passport',
      sourceKinds: ['note'],
      spaceId: 'spc_123',
      userId: 'user_123',
    });

    const query = compileQuery(getExecutedQuery(execute));

    expect(query.sql).toContain('"memories"."state" =');
    expect(query.sql).toContain('exists (');
    expect(query.sql).toContain('from "memory_citations"');
    expect(query.sql).toContain('"source_items"."kind" in');
    expect(query.params).toEqual(
      expect.arrayContaining(['passport', 'user_123', 'spc_123', 'note']),
    );
    expect(result).toEqual([
      expect.objectContaining({
        memoryId: 'mem_1',
        score: 0.72,
      }),
    ]);
  });

  it('loads grounded memory citations with backing segment evidence', async () => {
    const { db, execute } = createDbMock([
      {
        rows: [
          {
            canonicalUri: 'https://example.com/note',
            locator: { page: 2 },
            memoryCitationOrdinal: 1,
            memoryId: 'mem_1',
            quoteText: null,
            segmentContent: 'Bring ID and passport.',
            segmentId: 'seg_1',
            segmentMetadata: { page: 2 },
            segmentOrdinal: 3,
            sourceItemId: 'src_1',
            sourceKind: 'note',
            sourceTitle: 'Renewal note',
          },
        ],
      },
    ]);
    const repository = createRetrievalRepository(db);

    const result = await repository.listGroundingCitationsForMemories({
      memoryIds: ['mem_1'],
      userId: 'user_123',
    });

    const query = compileQuery(getExecutedQuery(execute));

    expect(query.sql).toContain('"memory_citations"."segment_id" is not null');
    expect(query.sql).toContain('"memories"."id" in');
    expect(result).toEqual([
      expect.objectContaining({
        memoryId: 'mem_1',
        quoteText: 'Bring ID and passport.',
        segmentId: 'seg_1',
      }),
    ]);
  });

  it('updates segment embeddings in a single set-based transaction query', async () => {
    const { db, execute, transaction } = createDbMock([
      { rowCount: 2, rows: [{ segmentId: 'seg_1' }, { segmentId: 'seg_2' }] },
    ]);
    const repository = createRetrievalRepository(db);

    await repository.updateSegmentEmbeddings({
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

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);

    const query = compileQuery(getExecutedQuery(execute));
    expect(query.sql).toContain('update "segments"');
    expect(query.sql).toContain('from (values');
    expect(query.sql).toContain('cast(v.embedding as vector)');
    expect(query.sql).toContain('returning "segments"."id" as "segmentId"');
    expect(query.params).toEqual(
      expect.arrayContaining([
        'seg_1',
        serializeVector(createEmbedding(1)),
        'google/gemini-embedding-2',
        'seg_2',
        serializeVector(createEmbedding(2)),
      ]),
    );
  });

  it('fails fast when an embedding update no longer matches a live segment row', async () => {
    const { db } = createDbMock([{ rowCount: 0, rows: [] }]);
    const repository = createRetrievalRepository(db);

    await expect(
      repository.updateSegmentEmbeddings({
        embeddedAt: new Date('2026-03-29T10:00:00.000Z'),
        embeddings: [
          {
            embedding: createEmbedding(1),
            embeddingModel: 'google/gemini-embedding-2',
            segmentId: 'seg_1',
          },
        ],
      }),
    ).rejects.toThrow(
      'Expected to update embeddings for 1 segments, but only updated 0. At least one segment was no longer available.',
    );
  });

  it('rejects vector serialization when a component is not finite', async () => {
    const { db } = createDbMock();
    const repository = createRetrievalRepository(db);

    await expect(
      repository.searchSegmentsByVector({
        limit: 3,
        queryEmbedding: [Number.NaN],
        userId: 'user_123',
      }),
    ).rejects.toThrow(
      'Cannot serialize a vector with non-finite component: NaN.',
    );
  });
});
