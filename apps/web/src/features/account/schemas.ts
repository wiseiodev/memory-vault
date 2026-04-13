import { z } from 'zod';

export const EXPORT_MANIFEST_VERSION = '1';

export const accountExportUser = z.object({
  createdAt: z.string(),
  email: z.string(),
  id: z.string(),
  name: z.string(),
});

export const accountExportSpace = z.object({
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  description: z.string().nullable(),
  id: z.string(),
  isDefault: z.boolean(),
  name: z.string(),
  slug: z.string().nullable(),
  updatedAt: z.string(),
});

export const accountExportSourceItem = z.object({
  canonicalUri: z.string().nullable(),
  capturedAt: z.string().nullable(),
  checksumSha256: z.string().nullable(),
  connectorKey: z.string().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  externalId: z.string().nullable(),
  externalParentId: z.string().nullable(),
  id: z.string(),
  kind: z.string(),
  languageCode: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  mimeType: z.string().nullable(),
  processedAt: z.string().nullable(),
  sourceFingerprint: z.string().nullable(),
  spaceId: z.string(),
  status: z.string(),
  title: z.string().nullable(),
  updatedAt: z.string(),
});

export const accountExportBlob = z.object({
  bucket: z.string().nullable(),
  byteSize: z.string().nullable(),
  checksumSha256: z.string().nullable(),
  contentType: z.string().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  downloadUrlExpiresAt: z.string().nullable(),
  etag: z.string().nullable(),
  extractionStatus: z.string(),
  id: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  objectKey: z.string(),
  sourceItemId: z.string(),
  storageProvider: z.string(),
  uploadedAt: z.string().nullable(),
});

export const accountExportSegment = z.object({
  charEnd: z.number().int().nullable(),
  charStart: z.number().int().nullable(),
  content: z.string(),
  contentHash: z.string().nullable(),
  createdAt: z.string(),
  id: z.string(),
  kind: z.string(),
  ordinal: z.number().int(),
  sourceBlobId: z.string().nullable(),
  sourceItemId: z.string(),
  tokenCount: z.number().int().nullable(),
});

export const accountExportMemory = z.object({
  confidence: z.number().nullable(),
  content: z.string(),
  createdAt: z.string(),
  id: z.string(),
  kind: z.string(),
  lastObservedAt: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  spaceId: z.string(),
  state: z.string(),
  summary: z.string().nullable(),
  supersededByMemoryId: z.string().nullable(),
  title: z.string().nullable(),
  updatedAt: z.string(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
});

export const accountExportCitation = z.object({
  id: z.string(),
  locator: z.record(z.string(), z.unknown()),
  memoryId: z.string(),
  ordinal: z.number().int(),
  quoteText: z.string().nullable(),
  segmentId: z.string().nullable(),
  sourceItemId: z.string().nullable(),
});

export const accountExportDeviceToken = z.object({
  createdAt: z.string(),
  id: z.string(),
  label: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  platform: z.string(),
  revokedAt: z.string().nullable(),
  spaceId: z.string().nullable(),
  tokenPrefix: z.string(),
});

export const accountExportManifest = z.object({
  blobs: z.array(accountExportBlob),
  citations: z.array(accountExportCitation),
  deviceTokens: z.array(accountExportDeviceToken),
  downloadUrlTtlSeconds: z.number().int().nonnegative(),
  generatedAt: z.string(),
  memories: z.array(accountExportMemory),
  notes: z.object({
    backupRetention: z.string(),
    downloadUrlTtl: z.string(),
  }),
  segments: z.array(accountExportSegment),
  sourceItems: z.array(accountExportSourceItem),
  spaces: z.array(accountExportSpace),
  user: accountExportUser,
  version: z.literal(EXPORT_MANIFEST_VERSION),
});

export const accountExportOutput = accountExportManifest;

export const deleteAccountOutput = z.object({
  deleted: z.literal(true),
  userId: z.string(),
});

export type AccountExportManifest = z.infer<typeof accountExportManifest>;
