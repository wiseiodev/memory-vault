import 'server-only';

import { createHash } from 'node:crypto';
import { ORPCError } from '@orpc/server';
import { generateId } from '@/db/columns/id';
import { embedSegmentsForSourceItem } from '@/features/retrieval/service';
import { inngest } from '@/inngest/client';
import { createIngestionJobRequestedEvent } from '@/inngest/events';
import {
  ingestionJobsChannel,
  ingestionJobUpsertTopicName,
} from '@/inngest/realtime';
import { getRequestLogger } from '@/lib/evlog';
import { buildSegmentsFromExtractedDocument } from './chunking';
import { IngestionPipelineError } from './errors';
import type { ExtractSourceDocumentInput } from './extraction';
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
  publishJobUpdate: typeof publishIngestionJobUpdate;
  repository: IngestionRepository;
};

type IngestionStepRunner = <T>(
  stepId: string,
  fn: () => Promise<T>,
) => Promise<T>;

type RealtimeJobUpdate = {
  job: IngestionJobListItem;
  userId: string;
};

type ProcessDeps = {
  embedSegmentsForSourceItem?: typeof embedSegmentsForSourceItem;
  loadJobRealtimeTarget?: (input: {
    jobId: string;
    stepId: string;
  }) => Promise<RealtimeJobUpdate | null>;
  now: () => Date;
  publishJobUpdate?: (input: {
    stepId: string;
    update: RealtimeJobUpdate;
  }) => Promise<void>;
  repository: IngestionRepository;
  run: IngestionStepRunner;
  buildSegmentsFromDocument?: typeof buildSegmentsFromExtractedDocument;
  extractSourceDocument?: (
    job: ExtractSourceDocumentInput,
  ) => ReturnType<typeof import('./extraction').extractSourceDocument>;
};

async function loadExtractSourceDocument() {
  const module = await import('./extraction');
  return module.extractSourceDocument;
}

type PublishRealtimeDeps = {
  publish: typeof inngest.realtime.publish;
  repository: Pick<IngestionRepository, 'getJobRealtimeTarget'>;
};

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

export async function publishIngestionJobUpdate(
  input: { jobId: string },
  deps: PublishRealtimeDeps = {
    publish: inngest.realtime.publish.bind(inngest.realtime),
    repository: createIngestionRepository(),
  },
) {
  const target = await deps.repository.getJobRealtimeTarget({
    jobId: input.jobId,
  });

  if (!target) {
    return null;
  }

  await deps.publish(
    ingestionJobsChannel({
      userId: target.userId,
    })[ingestionJobUpsertTopicName],
    target.job,
  );

  return target.job;
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
    publishJobUpdate: publishIngestionJobUpdate,
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

  try {
    await deps.publishJobUpdate({
      jobId: queuedJob.jobId,
    });
  } catch (error) {
    getRequestLogger().error(
      error instanceof Error
        ? error
        : new Error('Unknown ingestion realtime publish failure'),
      {
        action: 'ingestion.realtime_publish_failed',
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
    embedSegmentsForSourceItem,
    loadJobRealtimeTarget: undefined,
    now: () => new Date(),
    publishJobUpdate: undefined,
    repository: createIngestionRepository(),
    run: async (_stepId, fn) => fn(),
    buildSegmentsFromDocument: buildSegmentsFromExtractedDocument,
  },
) {
  const publishRealtimeUpdate = async (
    loadStepId: string,
    publishStepId: string,
  ) => {
    if (!deps.loadJobRealtimeTarget || !deps.publishJobUpdate) {
      return;
    }

    const update = await deps.loadJobRealtimeTarget({
      jobId: input.jobId,
      stepId: loadStepId,
    });

    if (!update) {
      return;
    }

    try {
      await deps.publishJobUpdate({
        stepId: publishStepId,
        update,
      });
    } catch (error) {
      getRequestLogger().error(
        error instanceof Error
          ? error
          : new Error('Unknown ingestion realtime publish failure'),
        {
          action: 'ingestion.realtime_publish_failed',
          jobId: input.jobId,
          sourceItemId: update.job.sourceItemId,
        },
      );
    }
  };

  const job = await deps.run('load-ingestion-job', async () =>
    deps.repository.getJobForProcessing({
      jobId: input.jobId,
    }),
  );

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

  const sourceItemId = job.sourceItemId;

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
    const startedAt = deps.now();
    const startedJob = await deps.run('start-ingestion-job', async () =>
      deps.repository.startJob({
        jobId: job.jobId,
        startedAt,
      }),
    );

    if (!startedJob) {
      return {
        jobId: job.jobId,
        segmentCount: 0,
        status: 'skipped' as const,
      };
    }

    sourceBlobId = startedJob.sourceBlobId;
    await publishRealtimeUpdate(
      'load-running-job-update',
      'publish-running-job-update',
    );

    const extractedDocument = await deps.run(
      'extract-source-document',
      async () =>
        (deps.extractSourceDocument ?? (await loadExtractSourceDocument()))(
          job,
        ),
    );
    currentStage = 'segment';
    const segments = (
      deps.buildSegmentsFromDocument ?? buildSegmentsFromExtractedDocument
    )(extractedDocument);
    await deps.run('replace-note-segments', async () =>
      deps.repository.replaceSegments({
        canonicalUri: extractedDocument.canonicalUri,
        jobId: job.jobId,
        languageCode: extractedDocument.languageCode,
        mimeType: extractedDocument.mimeType,
        segments,
        sourceItemId,
        title: extractedDocument.title,
        updatedAt: deps.now(),
      }),
    );
    await publishRealtimeUpdate(
      'load-segment-job-update',
      'publish-segment-job-update',
    );

    currentStage = 'embed';
    await deps.run('mark-embed-stage', async () =>
      deps.repository.markJobStage({
        jobId: job.jobId,
        stage: currentStage,
        updatedAt: deps.now(),
      }),
    );
    await publishRealtimeUpdate(
      'load-embed-job-update',
      'publish-embed-job-update',
    );
    await deps.run('embed-source-item-segments', async () =>
      (deps.embedSegmentsForSourceItem ?? embedSegmentsForSourceItem)({
        embeddedAt: deps.now(),
        sourceItemId,
      }),
    );

    currentStage = 'promote';
    await deps.run('mark-promote-stage', async () =>
      deps.repository.markJobStage({
        jobId: job.jobId,
        stage: currentStage,
        updatedAt: deps.now(),
      }),
    );
    await publishRealtimeUpdate(
      'load-promote-job-update',
      'publish-promote-job-update',
    );

    await deps.run('complete-ingestion-job', async () =>
      deps.repository.completeJob({
        finishedAt: deps.now(),
        jobId: job.jobId,
        sourceBlobId,
        sourceItemId,
      }),
    );
    await publishRealtimeUpdate(
      'load-complete-job-update',
      'publish-complete-job-update',
    );

    return {
      jobId: job.jobId,
      segmentCount: segments.length,
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

    await deps.run('fail-ingestion-job', async () =>
      deps.repository.failJob({
        errorCode: failure.code,
        errorDetails: failure.details,
        errorMessage: failure.message,
        failedAt: deps.now(),
        jobId: input.jobId,
        sourceBlobId,
        sourceItemId,
        stage: currentStage,
      }),
    );
    await publishRealtimeUpdate(
      'load-failed-job-update',
      'publish-failed-job-update',
    );

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
