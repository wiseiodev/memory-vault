import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db/columns/id', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}_123`),
}));

const requestLogger = {
  error: vi.fn(),
  set: vi.fn(),
};

vi.mock('@/lib/evlog', () => ({
  getRequestLogger: vi.fn(() => requestLogger),
  useLogger: vi.fn(() => requestLogger),
}));

import { ORPCError } from '@orpc/server';
import {
  buildNoteSegments,
  dispatchIngestionJob,
  processIngestionJob,
  retryIngestionJob,
} from './service';

function createRepositoryMocks() {
  return {
    completeJob: vi.fn(),
    createJob: vi.fn(),
    failJob: vi.fn(),
    getJobForDispatch: vi.fn(),
    getJobForProcessing: vi.fn(),
    getJobRealtimeTarget: vi.fn(),
    listOwnedRecentJobs: vi.fn(),
    markJobStage: vi.fn(),
    replaceSegments: vi.fn(),
    resetOwnedJobForRetry: vi.fn(),
    startJob: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildNoteSegments', () => {
  it('splits notes into deterministic paragraph segments', () => {
    const result = buildNoteSegments(
      'First paragraph words.\n\nSecond paragraph here.',
    );

    expect(result).toEqual([
      expect.objectContaining({
        content: 'First paragraph words.',
        id: 'seg_123',
        kind: 'plain_text',
        ordinal: 1,
        tokenCount: 3,
      }),
      expect.objectContaining({
        content: 'Second paragraph here.',
        id: 'seg_123',
        kind: 'plain_text',
        ordinal: 2,
        tokenCount: 3,
      }),
    ]);
    expect(result[0]?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects empty notes', () => {
    expect(() => buildNoteSegments(' \n\n ')).toThrow(
      'Cannot ingest an empty note body.',
    );
  });
});

describe('processIngestionJob', () => {
  it('processes note captures end to end and marks stage boundaries', async () => {
    const loadJobRealtimeTarget = vi
      .fn()
      .mockResolvedValueOnce({
        job: {
          attemptCount: 1,
          createdAt: '2026-03-29T01:00:00.000Z',
          errorCode: null,
          errorMessage: null,
          finishedAt: null,
          jobId: 'job_123',
          kind: 'ingest' as const,
          maxAttempts: 3,
          sourceItemId: 'src_123',
          sourceKind: 'note' as const,
          sourceTitle: 'Weekend prep',
          stage: 'extract' as const,
          status: 'running' as const,
          updatedAt: '2026-03-29T01:00:00.000Z',
        },
        userId: 'user_123',
      })
      .mockResolvedValueOnce({
        job: {
          attemptCount: 1,
          createdAt: '2026-03-29T01:00:00.000Z',
          errorCode: null,
          errorMessage: null,
          finishedAt: null,
          jobId: 'job_123',
          kind: 'ingest' as const,
          maxAttempts: 3,
          sourceItemId: 'src_123',
          sourceKind: 'note' as const,
          sourceTitle: 'Weekend prep',
          stage: 'segment' as const,
          status: 'running' as const,
          updatedAt: '2026-03-29T01:00:00.000Z',
        },
        userId: 'user_123',
      })
      .mockResolvedValueOnce({
        job: {
          attemptCount: 1,
          createdAt: '2026-03-29T01:00:00.000Z',
          errorCode: null,
          errorMessage: null,
          finishedAt: null,
          jobId: 'job_123',
          kind: 'ingest' as const,
          maxAttempts: 3,
          sourceItemId: 'src_123',
          sourceKind: 'note' as const,
          sourceTitle: 'Weekend prep',
          stage: 'embed' as const,
          status: 'running' as const,
          updatedAt: '2026-03-29T01:00:00.000Z',
        },
        userId: 'user_123',
      })
      .mockResolvedValueOnce({
        job: {
          attemptCount: 1,
          createdAt: '2026-03-29T01:00:00.000Z',
          errorCode: null,
          errorMessage: null,
          finishedAt: null,
          jobId: 'job_123',
          kind: 'ingest' as const,
          maxAttempts: 3,
          sourceItemId: 'src_123',
          sourceKind: 'note' as const,
          sourceTitle: 'Weekend prep',
          stage: 'promote' as const,
          status: 'running' as const,
          updatedAt: '2026-03-29T01:00:00.000Z',
        },
        userId: 'user_123',
      })
      .mockResolvedValueOnce({
        job: {
          attemptCount: 1,
          createdAt: '2026-03-29T01:00:00.000Z',
          errorCode: null,
          errorMessage: null,
          finishedAt: '2026-03-29T01:00:00.000Z',
          jobId: 'job_123',
          kind: 'ingest' as const,
          maxAttempts: 3,
          sourceItemId: 'src_123',
          sourceKind: 'note' as const,
          sourceTitle: 'Weekend prep',
          stage: 'complete' as const,
          status: 'succeeded' as const,
          updatedAt: '2026-03-29T01:00:00.000Z',
        },
        userId: 'user_123',
      });
    const publishJobUpdate = vi.fn(async () => undefined);
    const repository = {
      ...createRepositoryMocks(),
      completeJob: vi.fn(async () => undefined),
      getJobForProcessing: vi.fn(async () => ({
        attemptCount: 0,
        jobId: 'job_123',
        maxAttempts: 3,
        payload: {
          sourceKind: 'note',
        },
        sourceBlobId: null,
        sourceItemId: 'src_123',
        sourceKind: 'note' as const,
        sourceMetadata: {
          noteBody: 'Pack charger.\n\nBook dog sitter.',
        },
        sourceTitle: 'Weekend prep',
        spaceId: 'spc_123',
        stage: 'extract' as const,
        status: 'queued' as const,
      })),
      markJobStage: vi.fn(async () => undefined),
      replaceSegments: vi.fn(async () => undefined),
      startJob: vi.fn(async () => ({
        jobId: 'job_123',
        sourceBlobId: null,
        sourceItemId: 'src_123',
      })),
    };

    const result = await processIngestionJob(
      { jobId: 'job_123' },
      {
        loadJobRealtimeTarget,
        now: () => new Date('2026-03-29T01:00:00.000Z'),
        publishJobUpdate,
        repository,
        run: async (_stepId, fn) => fn(),
      },
    );

    expect(repository.startJob).toHaveBeenCalledWith({
      jobId: 'job_123',
      startedAt: new Date('2026-03-29T01:00:00.000Z'),
    });
    expect(repository.replaceSegments).toHaveBeenCalledWith({
      jobId: 'job_123',
      segments: [
        expect.objectContaining({
          content: 'Pack charger.',
          ordinal: 1,
        }),
        expect.objectContaining({
          content: 'Book dog sitter.',
          ordinal: 2,
        }),
      ],
      sourceItemId: 'src_123',
      updatedAt: new Date('2026-03-29T01:00:00.000Z'),
    });
    expect(repository.markJobStage).toHaveBeenNthCalledWith(1, {
      jobId: 'job_123',
      stage: 'embed',
      updatedAt: new Date('2026-03-29T01:00:00.000Z'),
    });
    expect(repository.markJobStage).toHaveBeenNthCalledWith(2, {
      jobId: 'job_123',
      stage: 'promote',
      updatedAt: new Date('2026-03-29T01:00:00.000Z'),
    });
    expect(repository.completeJob).toHaveBeenCalledWith({
      finishedAt: new Date('2026-03-29T01:00:00.000Z'),
      jobId: 'job_123',
      sourceItemId: 'src_123',
    });
    expect(publishJobUpdate).toHaveBeenNthCalledWith(1, {
      stepId: 'publish-running-job-update',
      update: expect.objectContaining({
        job: expect.objectContaining({
          stage: 'extract',
          status: 'running',
        }),
        userId: 'user_123',
      }),
    });
    expect(publishJobUpdate).toHaveBeenNthCalledWith(2, {
      stepId: 'publish-segment-job-update',
      update: expect.objectContaining({
        job: expect.objectContaining({
          stage: 'segment',
          status: 'running',
        }),
      }),
    });
    expect(publishJobUpdate).toHaveBeenNthCalledWith(3, {
      stepId: 'publish-embed-job-update',
      update: expect.objectContaining({
        job: expect.objectContaining({
          stage: 'embed',
          status: 'running',
        }),
      }),
    });
    expect(publishJobUpdate).toHaveBeenNthCalledWith(4, {
      stepId: 'publish-promote-job-update',
      update: expect.objectContaining({
        job: expect.objectContaining({
          stage: 'promote',
          status: 'running',
        }),
      }),
    });
    expect(publishJobUpdate).toHaveBeenNthCalledWith(5, {
      stepId: 'publish-complete-job-update',
      update: expect.objectContaining({
        job: expect.objectContaining({
          stage: 'complete',
          status: 'succeeded',
        }),
      }),
    });
    expect(result).toEqual({
      jobId: 'job_123',
      segmentCount: 2,
      status: 'succeeded',
    });
  });

  it('fails unsupported source kinds with an explicit extractor error', async () => {
    const repository = {
      ...createRepositoryMocks(),
      failJob: vi.fn(async () => undefined),
      getJobForProcessing: vi.fn(async () => ({
        attemptCount: 0,
        jobId: 'job_123',
        maxAttempts: 3,
        payload: {
          sourceBlobId: 'blob_123',
          sourceKind: 'file',
        },
        sourceBlobId: 'blob_123',
        sourceItemId: 'src_123',
        sourceKind: 'file' as const,
        sourceMetadata: {},
        sourceTitle: 'Archive.pdf',
        spaceId: 'spc_123',
        stage: 'extract' as const,
        status: 'queued' as const,
      })),
      startJob: vi.fn(async () => ({
        jobId: 'job_123',
        sourceBlobId: 'blob_123',
        sourceItemId: 'src_123',
      })),
    };

    await expect(
      processIngestionJob(
        { jobId: 'job_123' },
        {
          loadJobRealtimeTarget: undefined,
          now: () => new Date('2026-03-29T01:00:00.000Z'),
          publishJobUpdate: undefined,
          repository,
          run: async (_stepId, fn) => fn(),
        },
      ),
    ).rejects.toThrow('file ingestion is not implemented yet.');

    expect(repository.failJob).toHaveBeenCalledWith({
      errorCode: 'EXTRACTOR_NOT_IMPLEMENTED',
      errorDetails: {
        sourceKind: 'file',
      },
      errorMessage: 'file ingestion is not implemented yet.',
      failedAt: new Date('2026-03-29T01:00:00.000Z'),
      jobId: 'job_123',
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      stage: 'extract',
    });
  });

  it('skips duplicate deliveries when another worker already claimed the job', async () => {
    const repository = {
      ...createRepositoryMocks(),
      getJobForProcessing: vi.fn(async () => ({
        attemptCount: 1,
        jobId: 'job_123',
        maxAttempts: 3,
        payload: {
          sourceKind: 'note',
        },
        sourceBlobId: null,
        sourceItemId: 'src_123',
        sourceKind: 'note' as const,
        sourceMetadata: {
          noteBody: 'Already being processed.',
        },
        sourceTitle: 'Duplicate delivery',
        spaceId: 'spc_123',
        stage: 'extract' as const,
        status: 'queued' as const,
      })),
      startJob: vi.fn(async () => null),
    };

    const result = await processIngestionJob(
      { jobId: 'job_123' },
      {
        loadJobRealtimeTarget: undefined,
        now: () => new Date('2026-03-29T01:00:00.000Z'),
        publishJobUpdate: undefined,
        repository,
        run: async (_stepId, fn) => fn(),
      },
    );

    expect(result).toEqual({
      jobId: 'job_123',
      segmentCount: 0,
      status: 'skipped',
    });
    expect(repository.failJob).not.toHaveBeenCalled();
    expect(repository.replaceSegments).not.toHaveBeenCalled();
  });
});

describe('retryIngestionJob', () => {
  it('requeues a failed job and dispatches it again', async () => {
    const repository = {
      ...createRepositoryMocks(),
      resetOwnedJobForRetry: vi.fn(async () => ({
        outcome: 'queued' as const,
        jobId: 'job_123',
        previousStatus: 'failed' as const,
        sourceBlobId: null,
        sourceItemId: 'src_123',
        stage: 'extract' as const,
        status: 'queued' as const,
      })),
    };
    const dispatchIngestionJob = vi.fn(async () => ({
      ids: ['evt_123'],
    }));

    const result = await retryIngestionJob(
      {
        jobId: 'job_123',
        userId: 'user_123',
      },
      {
        dispatchIngestionJob,
        now: () => new Date('2026-03-29T01:00:00.000Z'),
        publishJobUpdate: vi.fn(async () => null),
        repository,
      },
    );

    expect(dispatchIngestionJob).toHaveBeenCalledWith({
      jobId: 'job_123',
    });
    expect(result).toEqual({
      jobId: 'job_123',
      previousStatus: 'failed',
      sourceBlobId: null,
      sourceItemId: 'src_123',
      stage: 'extract',
      status: 'queued',
    });
  });

  it('keeps the queued retry when dispatching the event fails', async () => {
    const repository = {
      ...createRepositoryMocks(),
      resetOwnedJobForRetry: vi.fn(async () => ({
        outcome: 'queued' as const,
        jobId: 'job_123',
        previousStatus: 'failed' as const,
        sourceBlobId: null,
        sourceItemId: 'src_123',
        stage: 'extract' as const,
        status: 'queued' as const,
      })),
    };

    const result = await retryIngestionJob(
      {
        jobId: 'job_123',
        userId: 'user_123',
      },
      {
        dispatchIngestionJob: vi.fn(async () => {
          throw new Error('dev server unavailable');
        }),
        now: () => new Date('2026-03-29T01:00:00.000Z'),
        publishJobUpdate: vi.fn(async () => null),
        repository,
      },
    );

    expect(requestLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'dev server unavailable',
      }),
      {
        action: 'ingestion.dispatch_failed',
        jobId: 'job_123',
        sourceItemId: 'src_123',
      },
    );
    expect(result.status).toBe('queued');
  });

  it('rejects retries for running jobs', async () => {
    const repository = {
      ...createRepositoryMocks(),
      resetOwnedJobForRetry: vi.fn(async () => ({
        outcome: 'rejected' as const,
        jobId: 'job_123',
        previousStatus: 'running' as const,
        sourceBlobId: null,
        sourceItemId: 'src_123',
        stage: 'extract' as const,
        status: 'rejected' as const,
      })),
    };

    await expect(
      retryIngestionJob(
        {
          jobId: 'job_123',
          userId: 'user_123',
        },
        {
          dispatchIngestionJob: vi.fn(async () => ({
            ids: ['evt_123'],
          })),
          now: () => new Date('2026-03-29T01:00:00.000Z'),
          publishJobUpdate: vi.fn(async () => null),
          repository,
        },
      ),
    ).rejects.toThrow(
      new ORPCError('CONFLICT', {
        message: 'Running ingestion jobs cannot be retried.',
      }),
    );
  });

  it('rejects retries for completed jobs without mutating state', async () => {
    const repository = {
      ...createRepositoryMocks(),
      resetOwnedJobForRetry: vi.fn(async () => ({
        outcome: 'rejected' as const,
        jobId: 'job_123',
        previousStatus: 'succeeded' as const,
        sourceBlobId: null,
        sourceItemId: 'src_123',
        stage: 'complete' as const,
        status: 'rejected' as const,
      })),
    };

    await expect(
      retryIngestionJob(
        {
          jobId: 'job_123',
          userId: 'user_123',
        },
        {
          dispatchIngestionJob: vi.fn(async () => ({
            ids: ['evt_123'],
          })),
          now: () => new Date('2026-03-29T01:00:00.000Z'),
          publishJobUpdate: vi.fn(async () => null),
          repository,
        },
      ),
    ).rejects.toThrow(
      new ORPCError('CONFLICT', {
        message: 'Completed ingestion jobs cannot be retried.',
      }),
    );
  });
});

describe('dispatchIngestionJob', () => {
  it('keys the Inngest event by job id and next attempt number', async () => {
    const send = vi.fn(async () => ({
      ids: ['evt_123'],
    }));

    await dispatchIngestionJob(
      {
        jobId: 'job_123',
      },
      {
        repository: {
          getJobForDispatch: vi.fn(async () => ({
            attemptCount: 2,
            jobId: 'job_123',
          })),
        },
        send,
      },
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          jobId: 'job_123',
        },
        id: 'ingestion-job-requested:job_123:attempt:3',
        name: 'app/ingestion.job.requested',
      }),
    );
  });
});
