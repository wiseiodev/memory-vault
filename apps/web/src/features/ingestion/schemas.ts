import { z } from 'zod';

export const ingestionJobStatus = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
]);

export const ingestionJobStage = z.enum([
  'extract',
  'segment',
  'embed',
  'promote',
  'complete',
]);

export const retryIngestionJobInput = z.object({
  jobId: z.string().min(1, 'jobId is required.'),
});

export const retryIngestionJobOutput = z.object({
  jobId: z.string(),
  stage: ingestionJobStage,
  status: ingestionJobStatus,
});

export const ingestionJobListItem = z.object({
  attemptCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  finishedAt: z.string().nullable(),
  jobId: z.string(),
  kind: z.enum(['embed', 'evaluate', 'extract', 'ingest', 'segment', 'sync']),
  maxAttempts: z.number().int().positive(),
  sourceItemId: z.string().nullable(),
  sourceKind: z.enum(['file', 'note', 'web_page']).nullable(),
  sourceTitle: z.string().nullable(),
  stage: ingestionJobStage,
  status: ingestionJobStatus,
  updatedAt: z.string(),
});

export const listRecentIngestionJobsOutput = z.array(ingestionJobListItem);

export type IngestionJobListItem = z.infer<typeof ingestionJobListItem>;
