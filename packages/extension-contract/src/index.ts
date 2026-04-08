import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { z } from 'zod';

export const MAX_EXTENSION_HTML_SNAPSHOT_BYTES = 25 * 1024 * 1024;

export const extensionConnectStartParams = z.object({
  browserVersion: z.string().trim().min(1).max(200).optional(),
  callbackPath: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .startsWith('/', 'callbackPath must start with "/".'),
  deviceLabel: z.string().trim().min(1).max(120).optional(),
  extensionId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z]{32}$/u, 'extensionId must be a Chrome extension id.'),
  extensionVersion: z.string().trim().min(1).max(100).optional(),
  state: z.string().trim().min(16).max(512),
});

export type ExtensionConnectStartParams = z.infer<
  typeof extensionConnectStartParams
>;

export const extensionCaptureStatus = z.enum([
  'failed',
  'pending',
  'processing',
  'ready',
]);

export const extensionCaptureSummary = z.object({
  capturedAt: z.string(),
  kind: z.enum(['note', 'web_page']),
  sourceBlobId: z.string().optional(),
  sourceItemId: z.string(),
  spaceId: z.string(),
  status: extensionCaptureStatus,
});

export type ExtensionCaptureSummary = z.infer<typeof extensionCaptureSummary>;

export const createExtensionNoteInput = z.object({
  body: z.string().trim().min(1, 'body is required.'),
  captureRequestId: z.string().trim().min(1, 'captureRequestId is required.'),
  title: z.string().trim().min(1).max(300).optional(),
});

export const beginWebCaptureInput = z.object({
  browserVersion: z.string().trim().min(1).max(200).optional(),
  callbackPath: z.string().trim().min(1).max(200).optional(),
  canonicalLinkUrl: z.url().optional(),
  captureRequestId: z.string().trim().min(1, 'captureRequestId is required.'),
  capturedAt: z.iso.datetime(),
  extensionVersion: z.string().trim().min(1).max(100).optional(),
  faviconUrl: z.url().optional(),
  htmlByteSize: z
    .number()
    .int()
    .positive()
    .max(
      MAX_EXTENSION_HTML_SNAPSHOT_BYTES,
      `HTML snapshots must be ${MAX_EXTENSION_HTML_SNAPSHOT_BYTES} bytes or smaller.`,
    ),
  htmlContentType: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => value === 'text/html' || value === 'application/xhtml+xml',
      'htmlContentType must be text/html or application/xhtml+xml.',
    ),
  selectedText: z.string().trim().min(1).max(50_000).optional(),
  title: z.string().trim().min(1).max(1_000).optional(),
  url: z.url(),
});

export type BeginWebCaptureInput = z.infer<typeof beginWebCaptureInput>;

export const extensionUploadContract = z.object({
  objectKey: z.string(),
  sourceBlobId: z.string(),
  sourceItemId: z.string(),
  uploadHeaders: z.record(z.string(), z.string()),
  uploadMethod: z.literal('PUT'),
  uploadUrl: z.string(),
});

export const beginWebCaptureOutput = z.object({
  capture: extensionCaptureSummary,
  phase: z.enum(['already_captured', 'ready_to_complete', 'upload_required']),
  upload: extensionUploadContract.nullable(),
});

export type BeginWebCaptureOutput = z.infer<typeof beginWebCaptureOutput>;

export const completeWebCaptureInput = z.object({
  captureRequestId: z.string().trim().min(1, 'captureRequestId is required.'),
  sourceBlobId: z.string().trim().min(1, 'sourceBlobId is required.'),
  sourceItemId: z.string().trim().min(1, 'sourceItemId is required.'),
});

export const abandonWebCaptureInput = completeWebCaptureInput.extend({
  reason: z
    .enum(['canceled', 'serialization_failed', 'upload_failed'])
    .optional(),
});

export const abandonWebCaptureOutput = z.object({
  abandoned: z.literal(true),
});

export const revokeCurrentDeviceTokenOutput = z.object({
  revoked: z.literal(true),
});

export type CreateExtensionNoteInput = z.infer<typeof createExtensionNoteInput>;
export type CompleteWebCaptureInput = z.infer<typeof completeWebCaptureInput>;
export type AbandonWebCaptureInput = z.infer<typeof abandonWebCaptureInput>;

export type ExtensionRpcClient = {
  captures: {
    abandonWebCapture: (
      input: AbandonWebCaptureInput,
    ) => Promise<z.infer<typeof abandonWebCaptureOutput>>;
    beginWebCapture: (
      input: BeginWebCaptureInput,
    ) => Promise<BeginWebCaptureOutput>;
    completeWebCapture: (
      input: CompleteWebCaptureInput,
    ) => Promise<ExtensionCaptureSummary>;
    createExtensionNote: (
      input: CreateExtensionNoteInput,
    ) => Promise<ExtensionCaptureSummary>;
  };
  deviceTokens: {
    revokeCurrent: () => Promise<
      z.infer<typeof revokeCurrentDeviceTokenOutput>
    >;
  };
};

export function createExtensionRpcClient(input: {
  getBaseUrl: () => string;
  getToken: () => string | null | Promise<string | null>;
}): ExtensionRpcClient {
  const link = new RPCLink({
    headers: async () => {
      const token = await input.getToken();

      if (!token) {
        return {};
      }

      return {
        Authorization: `Bearer ${token}`,
      };
    },
    url: () => `${input.getBaseUrl().replace(/\/$/, '')}/rpc`,
  });

  return createORPCClient(link) as unknown as ExtensionRpcClient;
}
