import { describe, expect, it } from 'vitest';

import { queueRetriedIngestionJob, upsertIngestionJob } from './live-jobs';

describe('upsertIngestionJob', () => {
  it('replaces an existing job snapshot and preserves newest-first order', () => {
    const result = upsertIngestionJob(
      [
        {
          attemptCount: 1,
          createdAt: '2026-03-28T10:00:00.000Z',
          errorCode: null,
          errorMessage: null,
          finishedAt: null,
          jobId: 'job_old',
          kind: 'ingest',
          maxAttempts: 3,
          sourceItemId: 'src_old',
          sourceKind: 'note',
          sourceTitle: 'Older job',
          stage: 'extract',
          status: 'queued',
          updatedAt: '2026-03-28T10:00:00.000Z',
        },
        {
          attemptCount: 1,
          createdAt: '2026-03-27T10:00:00.000Z',
          errorCode: 'EXTRACTOR_NOT_IMPLEMENTED',
          errorMessage: 'Not implemented',
          finishedAt: '2026-03-27T10:05:00.000Z',
          jobId: 'job_failed',
          kind: 'ingest',
          maxAttempts: 3,
          sourceItemId: 'src_failed',
          sourceKind: 'file',
          sourceTitle: 'Failed job',
          stage: 'extract',
          status: 'failed',
          updatedAt: '2026-03-27T10:05:00.000Z',
        },
      ],
      {
        attemptCount: 2,
        createdAt: '2026-03-27T10:00:00.000Z',
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
        jobId: 'job_failed',
        kind: 'ingest',
        maxAttempts: 3,
        sourceItemId: 'src_failed',
        sourceKind: 'file',
        sourceTitle: 'Failed job',
        stage: 'extract',
        status: 'running',
        updatedAt: '2026-03-28T10:06:00.000Z',
      },
    );

    expect(result.map((job) => job.jobId)).toEqual(['job_old', 'job_failed']);
    expect(result[1]).toEqual(
      expect.objectContaining({
        attemptCount: 2,
        status: 'running',
      }),
    );
  });

  it('ignores stale updates that would regress a job snapshot', () => {
    const result = upsertIngestionJob(
      [
        {
          attemptCount: 2,
          createdAt: '2026-03-27T10:00:00.000Z',
          errorCode: null,
          errorMessage: null,
          finishedAt: null,
          jobId: 'job_123',
          kind: 'ingest',
          maxAttempts: 3,
          sourceItemId: 'src_123',
          sourceKind: 'note',
          sourceTitle: 'In flight',
          stage: 'promote',
          status: 'running',
          updatedAt: '2026-03-28T10:06:00.000Z',
        },
      ],
      {
        attemptCount: 2,
        createdAt: '2026-03-27T10:00:00.000Z',
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
        jobId: 'job_123',
        kind: 'ingest',
        maxAttempts: 3,
        sourceItemId: 'src_123',
        sourceKind: 'note',
        sourceTitle: 'In flight',
        stage: 'extract',
        status: 'queued',
        updatedAt: '2026-03-28T10:05:00.000Z',
      },
    );

    expect(result).toEqual([
      expect.objectContaining({
        stage: 'promote',
        status: 'running',
        updatedAt: '2026-03-28T10:06:00.000Z',
      }),
    ]);
  });
});

describe('queueRetriedIngestionJob', () => {
  it('clears failure details and marks the retried job as queued', () => {
    const result = queueRetriedIngestionJob(
      [
        {
          attemptCount: 1,
          createdAt: '2026-03-28T10:00:00.000Z',
          errorCode: 'EXTRACTOR_NOT_IMPLEMENTED',
          errorMessage: 'Not implemented',
          finishedAt: '2026-03-28T10:05:00.000Z',
          jobId: 'job_failed',
          kind: 'ingest',
          maxAttempts: 3,
          sourceItemId: 'src_failed',
          sourceKind: 'file',
          sourceTitle: 'Failed job',
          stage: 'extract',
          status: 'failed',
          updatedAt: '2026-03-28T10:05:00.000Z',
        },
      ],
      {
        jobId: 'job_failed',
        stage: 'extract',
        status: 'queued',
      },
      '2026-03-28T10:06:00.000Z',
    );

    expect(result).toEqual([
      expect.objectContaining({
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
        stage: 'extract',
        status: 'queued',
        updatedAt: '2026-03-28T10:06:00.000Z',
      }),
    ]);
  });
});
