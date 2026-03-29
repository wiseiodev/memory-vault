import 'server-only';

import { type SQL, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { serializeVector } from '@/db/columns';
import {
  memories,
  memoryCitations,
  segments,
  sourceItems,
  spaces,
} from '@/db/schema';
import type {
  GroundingCitation,
  MemoryRetrievalCandidate,
  RetrievalCandidate,
  RetrievalMode,
  RetrievalSourceKind,
  SearchSegmentsInput,
} from './types';

type Db = ReturnType<typeof getDb>;

type SegmentRow = {
  content: string;
  id: string;
  ordinal: number;
};

type SearchRow = {
  canonicalUri: string | null;
  content: string;
  effectiveSourceAt: Date | string;
  metadata: Record<string, unknown>;
  ordinal: number;
  score: number | string;
  segmentId: string;
  segmentKind: RetrievalCandidate['segmentKind'];
  sourceBlobId: string | null;
  sourceItemId: string;
  sourceKind: RetrievalSourceKind;
  sourceTitle: string | null;
};

type MemorySearchRow = {
  canonicalUri: string | null;
  confidence: number | string | null;
  content: string;
  createdAt: Date | string;
  memoryId: string;
  score: number | string;
  summary: string | null;
  title: string | null;
  updatedAt: Date | string;
};

type GroundingCitationRow = {
  canonicalUri: string | null;
  locator: Record<string, unknown>;
  memoryCitationOrdinal: number;
  memoryId: string;
  quoteText: string | null;
  segmentContent: string;
  segmentId: string;
  segmentMetadata: Record<string, unknown>;
  segmentOrdinal: number;
  sourceItemId: string;
  sourceKind: RetrievalSourceKind;
  sourceTitle: string | null;
};

export type RetrievalRepository = {
  listGroundingCitationsForMemories(input: {
    capturedAfter?: Date;
    capturedBefore?: Date;
    memoryIds: string[];
    sourceKinds?: RetrievalSourceKind[];
    spaceId?: string;
    userId: string;
  }): Promise<GroundingCitation[]>;
  listSegmentsForSourceItem(input: {
    force?: boolean;
    sourceItemId: string;
  }): Promise<SegmentRow[]>;
  searchMemoriesByText(
    input: SearchSegmentsInput,
  ): Promise<MemoryRetrievalCandidate[]>;
  searchMemoriesByVector(
    input: Omit<SearchSegmentsInput, 'query'> & {
      queryEmbedding: number[];
    },
  ): Promise<MemoryRetrievalCandidate[]>;
  searchSegmentsByText(
    input: SearchSegmentsInput,
  ): Promise<RetrievalCandidate[]>;
  searchSegmentsByVector(
    input: Omit<SearchSegmentsInput, 'query'> & {
      queryEmbedding: number[];
    },
  ): Promise<RetrievalCandidate[]>;
  updateSegmentEmbeddings(input: {
    embeddedAt: Date;
    embeddings: Array<{
      embedding: number[];
      embeddingModel: string;
      segmentId: string;
    }>;
  }): Promise<void>;
};

function mapSearchRow(row: SearchRow, retrievalMode: RetrievalMode) {
  return {
    canonicalUri: row.canonicalUri,
    content: row.content,
    effectiveSourceAt:
      row.effectiveSourceAt instanceof Date
        ? row.effectiveSourceAt
        : new Date(row.effectiveSourceAt),
    metadata: row.metadata ?? {},
    ordinal: row.ordinal,
    retrievalMode,
    score:
      typeof row.score === 'number' ? row.score : Number.parseFloat(row.score),
    segmentId: row.segmentId,
    segmentKind: row.segmentKind,
    sourceBlobId: row.sourceBlobId,
    sourceItemId: row.sourceItemId,
    sourceKind: row.sourceKind,
    sourceTitle: row.sourceTitle,
  } satisfies RetrievalCandidate;
}

function mapMemorySearchRow(row: MemorySearchRow): MemoryRetrievalCandidate {
  return {
    canonicalUri: row.canonicalUri,
    confidence:
      row.confidence === null
        ? null
        : typeof row.confidence === 'number'
          ? row.confidence
          : Number.parseFloat(row.confidence),
    content: row.content,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    memoryId: row.memoryId,
    score:
      typeof row.score === 'number' ? row.score : Number.parseFloat(row.score),
    summary: row.summary,
    title: row.title,
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  };
}

function mapGroundingCitationRow(row: GroundingCitationRow): GroundingCitation {
  return {
    canonicalUri: row.canonicalUri,
    locator: row.locator ?? {},
    memoryCitationOrdinal: row.memoryCitationOrdinal,
    memoryId: row.memoryId,
    quoteText: row.quoteText?.trim() || row.segmentContent,
    segmentContent: row.segmentContent,
    segmentId: row.segmentId,
    segmentMetadata: row.segmentMetadata ?? {},
    segmentOrdinal: row.segmentOrdinal,
    sourceItemId: row.sourceItemId,
    sourceKind: row.sourceKind,
    sourceTitle: row.sourceTitle,
  };
}

function effectiveSourceAtExpression() {
  return sql`coalesce(${sourceItems.capturedAt}, ${sourceItems.createdAt})`;
}

function vectorLiteral(value: number[]) {
  return sql`${serializeVector(value)}::vector`;
}

function buildSharedFilters(input: {
  capturedAfter?: Date;
  capturedBefore?: Date;
  sourceKinds?: RetrievalSourceKind[];
  spaceId?: string;
  userId: string;
}) {
  const effectiveSourceAt = effectiveSourceAtExpression();
  const filters: SQL[] = [
    sql`${spaces.ownerUserId} = ${input.userId}`,
    sql`${spaces.deletedAt} is null`,
    sql`${spaces.archivedAt} is null`,
    sql`${sourceItems.deletedAt} is null`,
    sql`${sourceItems.archivedAt} is null`,
    sql`${sourceItems.status} = 'ready'`,
    sql`${segments.deletedAt} is null`,
    sql`${segments.archivedAt} is null`,
  ];

  if (input.spaceId) {
    filters.push(sql`${sourceItems.spaceId} = ${input.spaceId}`);
  }

  if (input.sourceKinds && input.sourceKinds.length > 0) {
    filters.push(
      sql`${sourceItems.kind} in (${sql.join(
        input.sourceKinds.map((sourceKind) => sql`${sourceKind}`),
        sql`, `,
      )})`,
    );
  }

  if (input.capturedAfter) {
    filters.push(sql`${effectiveSourceAt} >= ${input.capturedAfter}`);
  }

  if (input.capturedBefore) {
    filters.push(sql`${effectiveSourceAt} <= ${input.capturedBefore}`);
  }

  return filters;
}

function buildMemoryBaseFilters(input: { spaceId?: string; userId: string }) {
  const filters: SQL[] = [
    sql`${spaces.ownerUserId} = ${input.userId}`,
    sql`${spaces.deletedAt} is null`,
    sql`${spaces.archivedAt} is null`,
    sql`${memories.deletedAt} is null`,
    sql`${memories.archivedAt} is null`,
    sql`${memories.state} = 'active'`,
  ];

  if (input.spaceId) {
    filters.push(sql`${memories.spaceId} = ${input.spaceId}`);
  }

  return filters;
}

function buildMemoryCitationPathExists(input: {
  capturedAfter?: Date;
  capturedBefore?: Date;
  sourceKinds?: RetrievalSourceKind[];
  spaceId?: string;
}) {
  const effectiveSourceAt = effectiveSourceAtExpression();
  const filters: SQL[] = [
    sql`${memoryCitations.memoryId} = ${memories.id}`,
    sql`${memoryCitations.segmentId} is not null`,
    sql`${segments.deletedAt} is null`,
    sql`${segments.archivedAt} is null`,
    sql`${sourceItems.deletedAt} is null`,
    sql`${sourceItems.archivedAt} is null`,
    sql`${sourceItems.status} = 'ready'`,
    sql`${sourceItems.spaceId} = ${memories.spaceId}`,
  ];

  if (input.sourceKinds && input.sourceKinds.length > 0) {
    filters.push(
      sql`${sourceItems.kind} in (${sql.join(
        input.sourceKinds.map((sourceKind) => sql`${sourceKind}`),
        sql`, `,
      )})`,
    );
  }

  if (input.capturedAfter) {
    filters.push(sql`${effectiveSourceAt} >= ${input.capturedAfter}`);
  }

  if (input.capturedBefore) {
    filters.push(sql`${effectiveSourceAt} <= ${input.capturedBefore}`);
  }

  if (input.spaceId) {
    filters.push(sql`${sourceItems.spaceId} = ${input.spaceId}`);
  }

  return sql`exists (
    select 1
    from ${memoryCitations}
    inner join ${segments}
      on ${memoryCitations.segmentId} = ${segments.id}
    inner join ${sourceItems}
      on ${segments.sourceItemId} = ${sourceItems.id}
    where ${sql.join(filters, sql` and `)}
  )`;
}

export function createRetrievalRepository(
  db: Db = getDb(),
): RetrievalRepository {
  return {
    async listGroundingCitationsForMemories(input) {
      if (input.memoryIds.length === 0) {
        return [];
      }

      const effectiveSourceAt = effectiveSourceAtExpression();
      const filters: SQL[] = [
        sql`${spaces.ownerUserId} = ${input.userId}`,
        sql`${spaces.deletedAt} is null`,
        sql`${spaces.archivedAt} is null`,
        sql`${memories.deletedAt} is null`,
        sql`${memories.archivedAt} is null`,
        sql`${memories.state} = 'active'`,
        sql`${memoryCitations.segmentId} is not null`,
        sql`${segments.deletedAt} is null`,
        sql`${segments.archivedAt} is null`,
        sql`${sourceItems.deletedAt} is null`,
        sql`${sourceItems.archivedAt} is null`,
        sql`${sourceItems.status} = 'ready'`,
        sql`${sourceItems.spaceId} = ${memories.spaceId}`,
        sql`${memories.id} in (${sql.join(
          input.memoryIds.map((memoryId) => sql`${memoryId}`),
          sql`, `,
        )})`,
      ];

      if (input.spaceId) {
        filters.push(sql`${memories.spaceId} = ${input.spaceId}`);
      }

      if (input.sourceKinds && input.sourceKinds.length > 0) {
        filters.push(
          sql`${sourceItems.kind} in (${sql.join(
            input.sourceKinds.map((sourceKind) => sql`${sourceKind}`),
            sql`, `,
          )})`,
        );
      }

      if (input.capturedAfter) {
        filters.push(sql`${effectiveSourceAt} >= ${input.capturedAfter}`);
      }

      if (input.capturedBefore) {
        filters.push(sql`${effectiveSourceAt} <= ${input.capturedBefore}`);
      }

      const result = await db.execute<GroundingCitationRow>(sql`
        select
          ${memories.id} as "memoryId",
          ${memoryCitations.ordinal} as "memoryCitationOrdinal",
          ${memoryCitations.quoteText} as "quoteText",
          ${memoryCitations.locator} as "locator",
          ${segments.id} as "segmentId",
          ${segments.content} as "segmentContent",
          ${segments.ordinal} as "segmentOrdinal",
          ${segments.metadata} as "segmentMetadata",
          ${sourceItems.id} as "sourceItemId",
          ${sourceItems.title} as "sourceTitle",
          ${sourceItems.kind} as "sourceKind",
          ${sourceItems.canonicalUri} as "canonicalUri"
        from ${memories}
        inner join ${spaces}
          on ${memories.spaceId} = ${spaces.id}
        inner join ${memoryCitations}
          on ${memoryCitations.memoryId} = ${memories.id}
        inner join ${segments}
          on ${memoryCitations.segmentId} = ${segments.id}
        inner join ${sourceItems}
          on ${segments.sourceItemId} = ${sourceItems.id}
        where ${sql.join(filters, sql` and `)}
        order by
          ${memories.id} asc,
          ${memoryCitations.ordinal} asc,
          ${segments.ordinal} asc
      `);

      return result.rows.map(mapGroundingCitationRow);
    },
    async listSegmentsForSourceItem(input) {
      const filters: SQL[] = [
        sql`${segments.sourceItemId} = ${input.sourceItemId}`,
        sql`${segments.deletedAt} is null`,
        sql`${segments.archivedAt} is null`,
        sql`${sourceItems.deletedAt} is null`,
        sql`${sourceItems.archivedAt} is null`,
      ];

      if (!input.force) {
        filters.push(sql`${segments.embedding} is null`);
      }

      const result = await db.execute<SegmentRow>(sql`
        select
          ${segments.id} as "id",
          ${segments.content} as "content",
          ${segments.ordinal} as "ordinal"
        from ${segments}
        inner join ${sourceItems}
          on ${segments.sourceItemId} = ${sourceItems.id}
        where ${sql.join(filters, sql` and `)}
        order by ${segments.ordinal} asc
      `);

      return result.rows.map((row) => ({
        content: row.content,
        id: row.id,
        ordinal: row.ordinal,
      }));
    },
    async searchMemoriesByText(input) {
      const queryExpression = sql`websearch_to_tsquery('simple', ${input.query})`;
      const documentExpression = sql`to_tsvector('simple', coalesce(${memories.title}, '') || ' ' || ${memories.content} || ' ' || coalesce(${memories.summary}, ''))`;
      const scoreExpression = sql`ts_rank_cd(${documentExpression}, ${queryExpression})`;
      const filters = [
        ...buildMemoryBaseFilters(input),
        sql`${documentExpression} @@ ${queryExpression}`,
        buildMemoryCitationPathExists(input),
      ];

      const result = await db.execute<MemorySearchRow>(sql`
        select
          ${memories.id} as "memoryId",
          ${memories.title} as "title",
          ${memories.content} as "content",
          ${memories.summary} as "summary",
          ${memories.confidence} as "confidence",
          ${memories.createdAt} as "createdAt",
          ${memories.updatedAt} as "updatedAt",
          ${scoreExpression} as "score",
          null::text as "canonicalUri"
        from ${memories}
        inner join ${spaces}
          on ${memories.spaceId} = ${spaces.id}
        where ${sql.join(filters, sql` and `)}
        order by ${scoreExpression} desc, ${memories.updatedAt} desc
        limit ${input.limit}
      `);

      return result.rows.map(mapMemorySearchRow);
    },
    async searchMemoriesByVector(input) {
      const distanceExpression = sql`${memories.embedding} <=> ${vectorLiteral(input.queryEmbedding)}`;
      const scoreExpression = sql`greatest(0, least(1, 1 - ((${distanceExpression}) / 2.0)))`;
      const filters = [
        ...buildMemoryBaseFilters(input),
        sql`${memories.embedding} is not null`,
        buildMemoryCitationPathExists(input),
      ];

      const result = await db.execute<MemorySearchRow>(sql`
        select
          ${memories.id} as "memoryId",
          ${memories.title} as "title",
          ${memories.content} as "content",
          ${memories.summary} as "summary",
          ${memories.confidence} as "confidence",
          ${memories.createdAt} as "createdAt",
          ${memories.updatedAt} as "updatedAt",
          ${scoreExpression} as "score",
          null::text as "canonicalUri"
        from ${memories}
        inner join ${spaces}
          on ${memories.spaceId} = ${spaces.id}
        where ${sql.join(filters, sql` and `)}
        order by ${distanceExpression} asc, ${memories.updatedAt} desc
        limit ${input.limit}
      `);

      return result.rows.map(mapMemorySearchRow);
    },
    async searchSegmentsByText(input) {
      const effectiveSourceAt = effectiveSourceAtExpression();
      const queryExpression = sql`websearch_to_tsquery('simple', ${input.query})`;
      const documentExpression = sql`to_tsvector('simple', ${segments.content})`;
      const scoreExpression = sql`ts_rank_cd(${documentExpression}, ${queryExpression})`;
      const filters = [
        ...buildSharedFilters(input),
        sql`${documentExpression} @@ ${queryExpression}`,
      ];

      const result = await db.execute<SearchRow>(sql`
        select
          ${segments.id} as "segmentId",
          ${segments.sourceItemId} as "sourceItemId",
          ${segments.sourceBlobId} as "sourceBlobId",
          ${segments.content} as "content",
          ${segments.ordinal} as "ordinal",
          ${segments.kind} as "segmentKind",
          ${segments.metadata} as "metadata",
          ${sourceItems.title} as "sourceTitle",
          ${sourceItems.canonicalUri} as "canonicalUri",
          ${sourceItems.kind} as "sourceKind",
          ${effectiveSourceAt} as "effectiveSourceAt",
          ${scoreExpression} as "score"
        from ${segments}
        inner join ${sourceItems}
          on ${segments.sourceItemId} = ${sourceItems.id}
        inner join ${spaces}
          on ${sourceItems.spaceId} = ${spaces.id}
        where ${sql.join(filters, sql` and `)}
        order by ${scoreExpression} desc, ${effectiveSourceAt} desc, ${segments.ordinal} asc
        limit ${input.limit}
      `);

      return result.rows.map((row) => mapSearchRow(row, 'text'));
    },
    async searchSegmentsByVector(input) {
      const effectiveSourceAt = effectiveSourceAtExpression();
      const distanceExpression = sql`${segments.embedding} <=> ${vectorLiteral(input.queryEmbedding)}`;
      const scoreExpression = sql`greatest(0, least(1, 1 - ((${distanceExpression}) / 2.0)))`;
      const filters = [
        ...buildSharedFilters(input),
        sql`${segments.embedding} is not null`,
      ];

      const result = await db.execute<SearchRow>(sql`
        select
          ${segments.id} as "segmentId",
          ${segments.sourceItemId} as "sourceItemId",
          ${segments.sourceBlobId} as "sourceBlobId",
          ${segments.content} as "content",
          ${segments.ordinal} as "ordinal",
          ${segments.kind} as "segmentKind",
          ${segments.metadata} as "metadata",
          ${sourceItems.title} as "sourceTitle",
          ${sourceItems.canonicalUri} as "canonicalUri",
          ${sourceItems.kind} as "sourceKind",
          ${effectiveSourceAt} as "effectiveSourceAt",
          ${scoreExpression} as "score"
        from ${segments}
        inner join ${sourceItems}
          on ${segments.sourceItemId} = ${sourceItems.id}
        inner join ${spaces}
          on ${sourceItems.spaceId} = ${spaces.id}
        where ${sql.join(filters, sql` and `)}
        order by ${distanceExpression} asc, ${effectiveSourceAt} desc, ${segments.ordinal} asc
        limit ${input.limit}
      `);

      return result.rows.map((row) => mapSearchRow(row, 'vector'));
    },
    async updateSegmentEmbeddings(input) {
      if (input.embeddings.length === 0) {
        return;
      }

      await db.transaction(async (tx) => {
        const values = sql.join(
          input.embeddings.map((embedding) => {
            return sql`(${embedding.segmentId}, ${serializeVector(embedding.embedding)}, ${embedding.embeddingModel})`;
          }),
          sql`, `,
        );

        const result = await tx.execute<{ segmentId: string }>(sql`
          update ${segments}
          set
            "embedding" = cast(v.embedding as vector),
            "embedding_model" = v.embedding_model,
            "embedded_at" = ${input.embeddedAt},
            "updated_at" = ${input.embeddedAt}
          from (values ${values}) as v(segment_id, embedding, embedding_model)
          where ${segments.id} = v.segment_id
            and ${segments.deletedAt} is null
            and ${segments.archivedAt} is null
          returning ${segments.id} as "segmentId"
        `);

        if (result.rows.length !== input.embeddings.length) {
          throw new Error(
            `Expected to update embeddings for ${input.embeddings.length} segments, but only updated ${result.rows.length}. At least one segment was no longer available.`,
          );
        }
      });
    },
  };
}
