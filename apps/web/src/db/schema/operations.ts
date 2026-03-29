import { sql } from 'drizzle-orm';
import {
  boolean,
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

import { prefixedId, timestamps, ulid } from '../columns';
import { user } from './auth';
import { memories } from './memories';
import { segments, sourceItems } from './sources';
import { spaces } from './spaces';

export const ingestionJobKind = pgEnum('ingestion_job_kind', [
  'embed',
  'evaluate',
  'extract',
  'ingest',
  'segment',
  'sync',
]);

export const jobStatus = pgEnum('job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
]);

export const ingestionStage = pgEnum('ingestion_stage', [
  'extract',
  'segment',
  'embed',
  'promote',
  'complete',
]);

export const devicePlatform = pgEnum('device_platform', ['chrome_extension']);

export const cursorStatus = pgEnum('cursor_status', [
  'idle',
  'running',
  'errored',
]);

export const evaluationKind = pgEnum('evaluation_kind', [
  'import_quality',
  'memory_quality',
  'retrieval',
]);

export const ingestionJobs = pgTable(
  'ingestion_jobs',
  {
    id: prefixedId('id', 'job'),
    spaceId: ulid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'restrict' }),
    sourceItemId: ulid('source_item_id').references(() => sourceItems.id, {
      onDelete: 'set null',
    }),
    kind: ingestionJobKind('kind').notNull(),
    stage: ingestionStage('stage').default('extract').notNull(),
    status: jobStatus('status').default('queued').notNull(),
    connectorKey: text('connector_key'),
    attemptCount: integer('attempt_count').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(1).notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    errorDetails: jsonb('error_details').$type<Record<string, unknown>>(),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    index('ing_jobs_space_status_idx').on(table.spaceId, table.status),
    index('ing_jobs_source_item_idx').on(table.sourceItemId),
    index('ing_jobs_kind_status_idx').on(table.kind, table.status),
    index('ing_jobs_stage_status_idx').on(table.stage, table.status),
    index('ing_jobs_created_idx').on(table.createdAt),
  ],
);

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: prefixedId('id', 'dtok'),
    userId: ulid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    spaceId: ulid('space_id').references(() => spaces.id, {
      onDelete: 'set null',
    }),
    platform: devicePlatform('platform').default('chrome_extension').notNull(),
    label: text('label'),
    tokenHash: text('token_hash').notNull(),
    hashAlgorithm: text('hash_algorithm').default('sha256').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('device_tokens_hash_uidx').on(table.tokenHash),
    index('device_tokens_user_idx').on(table.userId),
    index('device_tokens_space_idx').on(table.spaceId),
    index('device_tokens_platform_idx').on(table.platform),
    index('device_tokens_revoked_idx').on(table.revokedAt),
  ],
);

export const connectorCursors = pgTable(
  'connector_cursors',
  {
    id: prefixedId('id', 'ccur'),
    userId: ulid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    spaceId: ulid('space_id').references(() => spaces.id, {
      onDelete: 'set null',
    }),
    connectorKey: text('connector_key').notNull(),
    scopeKey: text('scope_key').notNull(),
    cursor: text('cursor'),
    status: cursorStatus('status').default('idle').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    lastError: text('last_error'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('connector_cursors_user_scope_uidx').on(
      table.userId,
      table.connectorKey,
      table.scopeKey,
    ),
    index('connector_cursors_space_idx').on(table.spaceId),
    index('connector_cursors_status_idx').on(table.status),
    index('connector_cursors_synced_idx').on(table.syncedAt),
  ],
);

export const evaluationRuns = pgTable(
  'evaluation_runs',
  {
    id: prefixedId('id', 'evrun'),
    spaceId: ulid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'restrict' }),
    createdByUserId: ulid('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    kind: evaluationKind('kind').notNull(),
    status: jobStatus('status').default('queued').notNull(),
    datasetKey: text('dataset_key'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    configuration: jsonb('configuration')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    summary: jsonb('summary')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    index('evaluation_runs_space_idx').on(table.spaceId),
    index('evaluation_runs_kind_status_idx').on(table.kind, table.status),
    index('evaluation_runs_created_idx').on(table.createdAt),
  ],
);

export const evaluationResults = pgTable(
  'evaluation_results',
  {
    id: prefixedId('id', 'evres'),
    evaluationRunId: ulid('evaluation_run_id')
      .notNull()
      .references(() => evaluationRuns.id, { onDelete: 'cascade' }),
    spaceId: ulid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'restrict' }),
    memoryId: ulid('memory_id').references(() => memories.id, {
      onDelete: 'set null',
    }),
    segmentId: ulid('segment_id').references(() => segments.id, {
      onDelete: 'set null',
    }),
    sourceItemId: ulid('source_item_id').references(() => sourceItems.id, {
      onDelete: 'set null',
    }),
    metric: text('metric').notNull(),
    score: doublePrecision('score'),
    passed: boolean('passed'),
    rationale: text('rationale'),
    details: jsonb('details')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    index('evaluation_results_run_idx').on(table.evaluationRunId),
    index('evaluation_results_space_metric_idx').on(
      table.spaceId,
      table.metric,
    ),
    index('evaluation_results_memory_idx').on(table.memoryId),
    index('evaluation_results_segment_idx').on(table.segmentId),
    index('evaluation_results_source_item_idx').on(table.sourceItemId),
  ],
);
