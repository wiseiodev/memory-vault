import {
  abandonWebCaptureInput,
  abandonWebCaptureOutput,
  beginWebCaptureInput,
  beginWebCaptureOutput,
  completeWebCaptureInput,
  createExtensionNoteInput,
  extensionCaptureSummary,
} from '@memory-vault/extension-contract';
import { z } from 'zod';

export const createNoteCaptureInput = z.object({
  body: z.string().trim().min(1, 'body is required.'),
  spaceId: z.string().optional(),
  title: z.string().trim().min(1).optional(),
});

export const createUrlCaptureInput = z.object({
  spaceId: z.string().optional(),
  title: z.string().trim().min(1).optional(),
  url: z.url('url must be a valid URL.'),
});

export const finalizeUploadCaptureInput = z.object({
  sourceBlobId: z.string().min(1, 'sourceBlobId is required.'),
  sourceItemId: z.string().min(1, 'sourceItemId is required.'),
});

export const captureSummaryOutput = z.object({
  capturedAt: z.string(),
  kind: z.enum(['file', 'note', 'web_page']),
  sourceItemId: z.string(),
  sourceBlobId: z.string().optional(),
  spaceId: z.string(),
  status: z.literal('pending'),
});

export {
  abandonWebCaptureInput,
  abandonWebCaptureOutput,
  beginWebCaptureInput,
  beginWebCaptureOutput,
  completeWebCaptureInput,
  createExtensionNoteInput,
  extensionCaptureSummary as extensionCaptureSummaryOutput,
};
