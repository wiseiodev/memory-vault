import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import { EMBEDDING_DIMENSIONS } from '@/db/columns';
import { segments } from '@/db/schema';
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
  const updateCalls: Array<{
    setValues?: Record<string, unknown>;
    table: unknown;
    whereClause?: unknown;
  }> = [];
  const transaction = vi.fn(async (callback) => {
    return callback({
      update(table: unknown) {
        const updateCall: {
          setValues?: Record<string, unknown>;
          table: unknown;
          whereClause?: unknown;
        } = { table };
        updateCalls.push(updateCall);

        return {
          set(values: Record<string, unknown>) {
            updateCall.setValues = values;

            return {
              where(whereClause: unknown) {
                updateCall.whereClause = whereClause;

                return {
                  returning: vi.fn(async () => {
                    const nextResponse = responses.shift();

                    return nextResponse?.rows ?? [];
                  }),
                };
              },
            };
          },
        };
      },
    });
  });

  return {
    db: {
      execute,
      transaction,
    } as never,
    execute,
    transaction,
    updateCalls,
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
    expect(query.sql).toContain(`'[${createEmbedding(1).join(',')}]'::vector`);
    expect(query.sql).toContain('"segments"."embedding" is not null');
    expect(query.sql).toContain('greatest(0, least(1, 1 - ((');
    expect(query.sql).toContain('order by');
    expect(query.params).toEqual(expect.arrayContaining(['user_123', 3]));
  });

  it('updates each segment embedding inside a transaction', async () => {
    const { db, transaction, updateCalls } = createDbMock([
      { rowCount: 1, rows: [{ segmentId: 'seg_1' }] },
      { rowCount: 1, rows: [{ segmentId: 'seg_2' }] },
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
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0]?.table).toBe(segments);
    expect(updateCalls[1]?.table).toBe(segments);

    const firstSetValues = updateCalls[0]?.setValues;
    if (!firstSetValues) {
      throw new Error('Expected first update() call to receive set() values.');
    }

    expect(firstSetValues.embeddingModel).toBe('google/gemini-embedding-2');
    expect(firstSetValues.embeddedAt).toEqual(
      new Date('2026-03-29T10:00:00.000Z'),
    );
    expect(firstSetValues.updatedAt).toEqual(
      new Date('2026-03-29T10:00:00.000Z'),
    );

    const firstEmbeddingSql = compileQuery(firstSetValues.embedding as SQL);
    expect(firstEmbeddingSql.sql).toContain('::vector');
    expect(firstEmbeddingSql.sql).toContain(
      `'[${createEmbedding(1).join(',')}]'::vector`,
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
      'Expected to update embedding for segment seg_1, but it was no longer available.',
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
