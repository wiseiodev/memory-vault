import { z } from 'zod';

export const itemKind = z.enum(['file', 'note', 'web_page']);

export const itemStatus = z.enum([
  'archived',
  'failed',
  'pending',
  'processing',
  'ready',
]);

export const listItemsInput = z.object({
  limit: z.number().int().min(1).max(100).default(50).optional(),
  spaceId: z.string().trim().min(1).optional(),
});

export const itemListItem = z.object({
  canonicalUri: z.string().nullable(),
  capturedAt: z.string().nullable(),
  createdAt: z.string(),
  kind: itemKind,
  memoryCount: z.number().int().nonnegative(),
  previewText: z.string().nullable(),
  segmentCount: z.number().int().nonnegative(),
  sourceItemId: z.string(),
  spaceId: z.string(),
  spaceName: z.string(),
  status: itemStatus,
  title: z.string().nullable(),
});

export const listItemsOutput = z.array(itemListItem);

export const getItemInput = z.object({
  sourceItemId: z.string().trim().min(1),
});

export const itemSegment = z.object({
  charEnd: z.number().int().nullable(),
  charStart: z.number().int().nullable(),
  content: z.string(),
  id: z.string(),
  kind: z.enum(['ocr', 'plain_text', 'quote', 'title', 'transcript']),
  ordinal: z.number().int(),
  tokenCount: z.number().int().nullable(),
});

export const itemBlob = z.object({
  byteSize: z.string().nullable(),
  contentType: z.string().nullable(),
  objectKey: z.string(),
  sourceBlobId: z.string(),
  uploadedAt: z.string().nullable(),
});

export const itemMemory = z.object({
  content: z.string(),
  createdAt: z.string(),
  id: z.string(),
  kind: z.string(),
  state: z.enum(['active', 'archived', 'invalidated', 'superseded']),
  summary: z.string().nullable(),
  title: z.string().nullable(),
});

export const itemDetail = z.object({
  blob: itemBlob.nullable(),
  canonicalUri: z.string().nullable(),
  capturedAt: z.string().nullable(),
  createdAt: z.string(),
  kind: itemKind,
  memories: z.array(itemMemory),
  memoryCount: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()),
  mimeType: z.string().nullable(),
  previewText: z.string().nullable(),
  segmentCount: z.number().int().nonnegative(),
  segments: z.array(itemSegment),
  sourceItemId: z.string(),
  spaceId: z.string(),
  spaceName: z.string(),
  status: itemStatus,
  title: z.string().nullable(),
  updatedAt: z.string(),
});

export type ItemListItem = z.infer<typeof itemListItem>;
export type ItemDetail = z.infer<typeof itemDetail>;
export type ItemSegment = z.infer<typeof itemSegment>;
export type ItemMemory = z.infer<typeof itemMemory>;
export type ItemBlob = z.infer<typeof itemBlob>;
