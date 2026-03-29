import 'server-only';

import { createHash } from 'node:crypto';

import { ORPCError } from '@orpc/server';

import { generateId } from '@/db/columns/id';
import { inngest } from '@/inngest/client';
import { createIngestionJobRequestedEvent } from '@/inngest/events';
import { getRequestLogger } from '@/lib/evlog';
import {
  createIngestionRepository,
  type IngestionJobStage,
  type IngestionRepository,
} from './repository';
import type { IngestionJobListItem } from './schemas';

export const DEFAULT_INGESTION_MAX_ATTEMPTS = 3;

type DispatchDeps = {
  repository: Pick<IngestionRepository, 'getJobForDispatch'>;
  send: typeof inngest.send;
};

type RetryDeps = {
  dispatchIngestionJob: typeof dispatchIngestionJob;
  now: () => Date;
  repository: IngestionRepository;
};

type ProcessDeps = {
  now: () => Date;
  repository: IngestionRepository;
};

class IngestionPipelineError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export async function dispatchIngestionJob(
  input: { jobId: string },
  deps: DispatchDeps = {
    repository: createIngestionRepository(),
    send: inngest.send.bind(inngest),
  },
) {
  const job = await deps.repository.getJobForDispatch({
    jobId: input.jobId,
  });

  if (!job) {
    throw new IngestionPipelineError(
      'JOB_NOT_FOUND',
      `Ingestion job ${input.jobId} was not found.`,
    );
  }

  return deps.send(
    createIngestionJobRequestedEvent({
      id: `ingestion-job-requested:${job.jobId}:attempt:${job.attemptCount + 1}`,
      jobId: input.jobId,
    }),
  );
}

export function buildNoteSegments(noteBody: string) {
  const normalizedBody = noteBody.replace(/\r\n/g, '\n').trim();

  if (!normalizedBody) {
    throw new IngestionPipelineError(
      'EMPTY_NOTE_BODY',
      'Cannot ingest an empty note body.',
    );
  }

  const blocks = normalizedBody
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    throw new IngestionPipelineError(
      'EMPTY_NOTE_BODY',
      'Cannot ingest an empty note body.',
    );
  }

  return blocks.map((content, index) => ({
    content,
    contentHash: createHash('sha256').update(content).digest('hex'),
    id: generateId('seg'),
    kind: 'plain_text' as const,
    ordinal: index + 1,
    tokenCount: content.split(/\s+/).filter(Boolean).length,
  }));
}

export async function listRecentIngestionJobs(
  input: { limit?: number; userId: string },
  deps: Pick<RetryDeps, 'repository'> = {
    repository: createIngestionRepository(),
  },
): Promise<IngestionJobListItem[]> {
  return deps.repository.listOwnedRecentJobs({
    limit: input.limit ?? 12,
    userId: input.userId,
  });
}

export async function retryIngestionJob(
  input: { jobId: string; userId: string },
  deps: RetryDeps = {
    dispatchIngestionJob,
    now: () => new Date(),
    repository: createIngestionRepository(),
  },
) {
  const queuedJob = await deps.repository.resetOwnedJobForRetry({
    jobId: input.jobId,
    queuedAt: deps.now(),
    userId: input.userId,
  });

  if (!queuedJob) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Ingestion job not found for this user.',
    });
  }

  if (queuedJob.outcome === 'rejected') {
    if (queuedJob.previousStatus === 'running') {
      throw new ORPCError('CONFLICT', {
        message: 'Running ingestion jobs cannot be retried.',
      });
    }

    if (queuedJob.previousStatus === 'succeeded') {
      throw new ORPCError('CONFLICT', {
        message: 'Completed ingestion jobs cannot be retried.',
      });
    }

    throw new ORPCError('CONFLICT', {
      message: 'Only failed ingestion jobs can be retried.',
    });
  }

  try {
    await deps.dispatchIngestionJob({
      jobId: queuedJob.jobId,
    });
  } catch (error) {
    getRequestLogger().error(
      error instanceof Error
        ? error
        : new Error('Unknown ingestion dispatch failure'),
      {
        action: 'ingestion.dispatch_failed',
        jobId: queuedJob.jobId,
        sourceItemId: queuedJob.sourceItemId,
      },
    );
  }

  return {
    jobId: queuedJob.jobId,
    previousStatus: queuedJob.previousStatus,
    sourceBlobId: queuedJob.sourceBlobId,
    sourceItemId: queuedJob.sourceItemId,
    stage: queuedJob.stage,
    status: 'queued' as const,
  };
}

export async function processIngestionJob(
  input: { jobId: string },
  deps: ProcessDeps = {
    now: () => new Date(),
    repository: createIngestionRepository(),
  },
) {
  const job = await deps.repository.getJobForProcessing({
    jobId: input.jobId,
  });

  if (!job) {
    throw new IngestionPipelineError(
      'JOB_NOT_FOUND',
      `Ingestion job ${input.jobId} was not found.`,
    );
  }

  if (!job.sourceItemId) {
    throw new IngestionPipelineError(
      'SOURCE_ITEM_REQUIRED',
      'Ingestion job is missing a source item reference.',
    );
  }

  if (job.status === 'succeeded') {
    return {
      jobId: job.jobId,
      segmentCount: 0,
      status: 'succeeded' as const,
    };
  }

  let currentStage: IngestionJobStage = 'extract';
  let sourceBlobId = job.sourceBlobId;

  try {
    const startedJob = await deps.repository.startJob({
      jobId: job.jobId,
      startedAt: deps.now(),
    });

    if (!startedJob) {
      return {
        jobId: job.jobId,
        segmentCount: 0,
        status: 'skipped' as const,
      };
    }

    sourceBlobId = startedJob.sourceBlobId;

    if (job.sourceKind !== 'note') {
      throw new IngestionPipelineError(
        'EXTRACTOR_NOT_IMPLEMENTED',
        `${job.sourceKind ?? 'unknown'} ingestion is not implemented yet.`,
        {
          sourceKind: job.sourceKind,
        },
      );
    }

    const noteBody = job.sourceMetadata.noteBody;

    if (typeof noteBody !== 'string' || noteBody.trim().length === 0) {
      throw new IngestionPipelineError(
        'NOTE_BODY_MISSING',
        'The captured note is missing noteBody metadata.',
      );
    }

    currentStage = 'segment';
    const noteSegments = buildNoteSegments(noteBody);
    await deps.repository.replaceSegments({
      jobId: job.jobId,
      segments: noteSegments,
      sourceItemId: job.sourceItemId,
      updatedAt: deps.now(),
    });

    currentStage = 'embed';
    await deps.repository.markJobStage({
      jobId: job.jobId,
      stage: currentStage,
      updatedAt: deps.now(),
    });

    currentStage = 'promote';
    await deps.repository.markJobStage({
      jobId: job.jobId,
      stage: currentStage,
      updatedAt: deps.now(),
    });

    await deps.repository.completeJob({
      finishedAt: deps.now(),
      jobId: job.jobId,
      sourceItemId: job.sourceItemId,
    });

    return {
      jobId: job.jobId,
      segmentCount: noteSegments.length,
      status: 'succeeded' as const,
    };
  } catch (error) {
    const failure =
      error instanceof IngestionPipelineError
        ? error
        : new IngestionPipelineError(
            'INGESTION_UNEXPECTED_ERROR',
            error instanceof Error
              ? error.message
              : 'Unknown ingestion failure.',
          );

    await deps.repository.failJob({
      errorCode: failure.code,
      errorDetails: failure.details,
      errorMessage: failure.message,
      failedAt: deps.now(),
      jobId: input.jobId,
      sourceBlobId,
      sourceItemId: job.sourceItemId,
      stage: currentStage,
    });

    throw failure;
  }
}

export async function dispatchIngestionJobForRequest(
  input: { jobId: string; sourceItemId: string },
  deps: Pick<RetryDeps, 'dispatchIngestionJob'> = {
    dispatchIngestionJob,
  },
) {
  try {
    await deps.dispatchIngestionJob({
      jobId: input.jobId,
    });
  } catch (error) {
    getRequestLogger().error(
      error instanceof Error
        ? error
        : new Error('Unknown ingestion dispatch failure'),
      {
        action: 'ingestion.dispatch_failed',
        jobId: input.jobId,
        sourceItemId: input.sourceItemId,
      },
    );
  }
}
