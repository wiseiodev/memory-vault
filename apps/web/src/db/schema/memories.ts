import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import {
  EMBEDDING_DIMENSIONS,
  prefixedId,
  softDelete,
  timestamps,
  ulid,
  vector,
} from '../columns';
import { user } from './auth';
import { segments, sourceItems } from './sources';
import { spaces } from './spaces';

export const memoryState = pgEnum('memory_state', [
  'active',
  'superseded',
  'invalidated',
  'archived',
]);

export type MemoryKind =
  | 'belief'
  | 'event'
  | 'fact'
  | 'goal'
  | 'identity'
  | 'insight'
  | 'person'
  | 'preference'
  | 'task';

export const memories = pgTable(
  'memories',
  {
    id: prefixedId('id', 'mem'),
    spaceId: ulid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'restrict' }),
    createdByUserId: ulid('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    state: memoryState('state').default('active').notNull(),
    kind: text('kind').$type<MemoryKind>().notNull(),
    title: text('title'),
    content: text('content').notNull(),
    summary: text('summary'),
    confidence: doublePrecision('confidence'),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validTo: timestamp('valid_to', { withTimezone: true }),
    lastObservedAt: timestamp('last_observed_at', { withTimezone: true }),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    supersededByMemoryId: ulid('superseded_by_memory_id').references(
      (): AnyPgColumn => memories.id,
      { onDelete: 'set null' },
    ),
    embedding: vector('embedding', EMBEDDING_DIMENSIONS),
    embeddingModel: text('embedding_model'),
    embeddedAt: timestamp('embedded_at', { withTimezone: true }),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...softDelete,
    ...timestamps,
  },
  (table) => [
    index('memories_space_idx').on(table.spaceId),
    index('memories_space_state_idx').on(table.spaceId, table.state),
    index('memories_space_kind_idx').on(table.spaceId, table.kind),
    index('memories_space_updated_idx').on(table.spaceId, table.updatedAt),
    index('memories_observed_idx').on(table.lastObservedAt),
    index('memories_superseded_by_idx').on(table.supersededByMemoryId),
    index('memories_embedded_idx').on(table.embeddedAt),
    index('memories_content_fts_idx')
      .using(
        'gin',
        sql`to_tsvector('simple', coalesce(${table.title}, '') || ' ' || ${table.content} || ' ' || coalesce(${table.summary}, ''))`,
      )
      .where(sql`${table.deletedAt} is null`),
    index('memories_embedding_hnsw_idx')
      .using('hnsw', table.embedding.op('vector_cosine_ops'))
      .where(sql`${table.deletedAt} is null`)
      .with({ m: 16, ef_construction: 64 }),
    check(
      'memories_superseded_self_check',
      sql`${table.supersededByMemoryId} is null or ${table.supersededByMemoryId} <> ${table.id}`,
    ),
  ],
);

export const memoryCitations = pgTable(
  'memory_citations',
  {
    id: prefixedId('id', 'cite'),
    memoryId: ulid('memory_id')
      .notNull()
      .references(() => memories.id, { onDelete: 'cascade' }),
    sourceItemId: ulid('source_item_id').references(() => sourceItems.id, {
      onDelete: 'restrict',
    }),
    segmentId: ulid('segment_id').references(() => segments.id, {
      onDelete: 'restrict',
    }),
    ordinal: integer('ordinal').notNull(),
    quoteText: text('quote_text'),
    locator: jsonb('locator')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('memory_citations_memory_ordinal_uidx').on(
      table.memoryId,
      table.ordinal,
    ),
    index('memory_citations_segment_idx').on(table.segmentId),
    index('memory_citations_source_item_idx').on(table.sourceItemId),
    check(
      'memory_citations_target_check',
      sql`${table.sourceItemId} is not null or ${table.segmentId} is not null`,
    ),
  ],
);
