import { sql } from 'drizzle-orm';
import {
  bigint,
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
import { spaces } from './spaces';

export const sourceKind = pgEnum('source_kind', [
  'api',
  'bookmark',
  'chat',
  'email',
  'file',
  'note',
  'web_page',
]);

export const sourceStatus = pgEnum('source_status', [
  'pending',
  'processing',
  'ready',
  'failed',
  'archived',
]);

export const blobStorageProvider = pgEnum('blob_storage_provider', [
  'external_url',
  's3',
  'vercel_blob',
]);

export const blobExtractionStatus = pgEnum('blob_extraction_status', [
  'pending',
  'processing',
  'ready',
  'failed',
]);

export const segmentKind = pgEnum('segment_kind', [
  'ocr',
  'plain_text',
  'quote',
  'title',
  'transcript',
]);

export const sourceItems = pgTable(
  'source_items',
  {
    id: prefixedId('id', 'src'),
    spaceId: ulid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'restrict' }),
    createdByUserId: ulid('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    kind: sourceKind('kind').notNull(),
    status: sourceStatus('status').default('pending').notNull(),
    title: text('title'),
    canonicalUri: text('canonical_uri'),
    connectorKey: text('connector_key'),
    externalId: text('external_id'),
    externalParentId: text('external_parent_id'),
    sourceFingerprint: text('source_fingerprint'),
    checksumSha256: text('checksum_sha256'),
    mimeType: text('mime_type'),
    languageCode: text('language_code'),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...softDelete,
    ...timestamps,
  },
  (table) => [
    index('src_items_space_idx').on(table.spaceId),
    index('src_items_space_status_idx').on(table.spaceId, table.status),
    index('src_items_space_captured_idx').on(table.spaceId, table.capturedAt),
    index('src_items_created_by_idx').on(table.createdByUserId),
    index('src_items_connector_ext_idx').on(
      table.connectorKey,
      table.externalId,
    ),
    uniqueIndex('src_items_space_connector_ext_uidx')
      .on(table.spaceId, table.connectorKey, table.externalId)
      .where(
        sql`${table.deletedAt} is null and ${table.connectorKey} is not null and ${table.externalId} is not null`,
      ),
    index('src_items_space_fp_idx').on(table.spaceId, table.sourceFingerprint),
    uniqueIndex('src_items_space_fp_uidx')
      .on(table.spaceId, table.sourceFingerprint)
      .where(
        sql`${table.deletedAt} is null and ${table.sourceFingerprint} is not null`,
      ),
    index('src_items_checksum_idx').on(table.checksumSha256),
    index('src_items_uri_idx').on(table.canonicalUri),
  ],
);

export const sourceBlobs = pgTable(
  'source_blobs',
  {
    id: prefixedId('id', 'blob'),
    sourceItemId: ulid('source_item_id')
      .notNull()
      .references(() => sourceItems.id, { onDelete: 'cascade' }),
    storageProvider: blobStorageProvider('storage_provider').notNull(),
    objectKey: text('object_key').notNull(),
    bucket: text('bucket'),
    contentType: text('content_type'),
    byteSize: bigint('byte_size', { mode: 'number' }),
    checksumSha256: text('checksum_sha256'),
    etag: text('etag'),
    extractionStatus: blobExtractionStatus('extraction_status')
      .default('pending')
      .notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    extractedAt: timestamp('extracted_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...softDelete,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('src_blobs_object_key_uidx').on(table.objectKey),
    index('src_blobs_item_idx').on(table.sourceItemId),
    index('src_blobs_checksum_idx').on(table.checksumSha256),
    index('src_blobs_uploaded_idx').on(table.uploadedAt),
  ],
);

export const segments = pgTable(
  'segments',
  {
    id: prefixedId('id', 'seg'),
    sourceItemId: ulid('source_item_id')
      .notNull()
      .references(() => sourceItems.id, { onDelete: 'cascade' }),
    sourceBlobId: ulid('source_blob_id').references(() => sourceBlobs.id, {
      onDelete: 'set null',
    }),
    ordinal: integer('ordinal').notNull(),
    kind: segmentKind('kind').default('plain_text').notNull(),
    content: text('content').notNull(),
    contentHash: text('content_hash'),
    tokenCount: integer('token_count'),
    charStart: integer('char_start'),
    charEnd: integer('char_end'),
    embedding: vector('embedding', EMBEDDING_DIMENSIONS),
    embeddingModel: text('embedding_model'),
    embeddedAt: timestamp('embedded_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...softDelete,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('segments_item_ordinal_uidx').on(
      table.sourceItemId,
      table.ordinal,
    ),
    index('segments_blob_idx').on(table.sourceBlobId),
    index('segments_item_hash_idx').on(table.sourceItemId, table.contentHash),
    index('segments_embedded_idx').on(table.embeddedAt),
    index('segments_item_created_idx').on(table.sourceItemId, table.createdAt),
    index('segments_content_fts_idx')
      .using('gin', sql`to_tsvector('simple', ${table.content})`)
      .where(sql`${table.deletedAt} is null`),
    index('segments_embedding_hnsw_idx')
      .using('hnsw', table.embedding.op('vector_cosine_ops'))
      .where(sql`${table.deletedAt} is null`)
      .with({ m: 16, ef_construction: 64 }),
  ],
);
