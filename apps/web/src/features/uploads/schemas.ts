import { z } from 'zod';

// --- Inputs ---

export const reserveUploadInput = z.object({
  byteSize: z
    .number()
    .int()
    .nonnegative()
    .max(500 * 1024 * 1024, 'File must be under 500 MB.'),
  contentType: z.string().trim().min(1, 'contentType is required.'),
  filename: z.string().trim().min(1, 'filename is required.'),
  spaceId: z.string().optional(),
});

export const completeUploadInput = z.object({
  sourceBlobId: z.string().min(1, 'sourceBlobId is required.'),
  sourceItemId: z.string().min(1, 'sourceItemId is required.'),
});

export const deleteUploadInput = completeUploadInput;

export const downloadUploadInput = z.object({
  sourceBlobId: z.string().min(1, 'sourceBlobId is required.'),
});

// --- Outputs ---

export const reserveUploadOutput = z.object({
  objectKey: z.string(),
  sourceBlobId: z.string(),
  sourceItemId: z.string(),
  spaceId: z.string(),
  uploadHeaders: z.record(z.string(), z.string()),
  uploadMethod: z.literal('PUT'),
  uploadUrl: z.string(),
});

export const completeUploadOutput = z.object({
  bucket: z.string().nullable(),
  byteSize: z.string().nullable(),
  contentType: z.string().nullable(),
  etag: z.string().nullable(),
  objectKey: z.string(),
  sourceBlobId: z.string(),
  sourceItemId: z.string(),
  spaceId: z.string(),
  uploadedAt: z.string().nullable(),
});

export const deleteUploadOutput = z.object({
  deleted: z.literal(true),
  sourceBlobId: z.string(),
  sourceItemId: z.string(),
});

export const downloadUploadOutput = z.string();

export const uploadListItem = z.object({
  byteSize: z.string().nullable(),
  contentType: z.string().nullable(),
  createdAt: z.string(),
  filename: z.string(),
  objectKey: z.string(),
  sourceBlobId: z.string(),
  sourceItemId: z.string(),
  status: z.enum(['failed', 'pending', 'uploaded']),
  uploadedAt: z.string().nullable(),
});

export const listUploadsOutput = z.array(uploadListItem);
