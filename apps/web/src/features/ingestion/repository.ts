import 'server-only';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  ingestionJobs,
  segments,
  sourceBlobs,
  sourceItems,
  spaces,
} from '@/db/schema';

type Db = ReturnType<typeof getDb>;

export type IngestionJobStage =
  | 'complete'
  | 'embed'
  | 'extract'
  | 'promote'
  | 'segment';

export type IngestionRepository = {
  completeJob(input: {
    finishedAt: Date;
    jobId: string;
    sourceItemId: string;
  }): Promise<void>;
  createJob(input: {
    jobId: string;
    maxAttempts: number;
    payload: Record<string, unknown>;
    sourceItemId: string;
    spaceId: string;
  }): Promise<{ jobId: string }>;
  failJob(input: {
    errorCode: string;
    errorDetails?: Record<string, unknown>;
    errorMessage: string;
    failedAt: Date;
    jobId: string;
    sourceBlobId?: string | null;
    sourceItemId?: string | null;
    stage: IngestionJobStage;
  }): Promise<void>;
  getJobForProcessing(input: { jobId: string }): Promise<{
    attemptCount: number;
    jobId: string;
    maxAttempts: number;
    payload: Record<string, unknown>;
    sourceBlobId: string | null;
    sourceItemId: string | null;
    sourceKind: 'file' | 'note' | 'web_page' | null;
    sourceMetadata: Record<string, unknown>;
    sourceTitle: string | null;
    spaceId: string;
    stage: IngestionJobStage;
    status: 'canceled' | 'failed' | 'queued' | 'running' | 'succeeded';
  } | null>;
  getJobForDispatch(input: { jobId: string }): Promise<{
    attemptCount: number;
    jobId: string;
  } | null>;
  listOwnedRecentJobs(input: { limit: number; userId: string }): Promise<
    Array<{
      attemptCount: number;
      createdAt: string;
      errorCode: string | null;
      errorMessage: string | null;
      finishedAt: string | null;
      jobId: string;
      kind: 'embed' | 'evaluate' | 'extract' | 'ingest' | 'segment' | 'sync';
      maxAttempts: number;
      sourceItemId: string | null;
      sourceKind: 'file' | 'note' | 'web_page' | null;
      sourceTitle: string | null;
      stage: IngestionJobStage;
      status: 'canceled' | 'failed' | 'queued' | 'running' | 'succeeded';
      updatedAt: string;
    }>
  >;
  markJobStage(input: {
    jobId: string;
    stage: IngestionJobStage;
    updatedAt: Date;
  }): Promise<void>;
  replaceSegments(input: {
    jobId: string;
    segments: Array<{
      content: string;
      contentHash: string;
      id: string;
      kind: 'plain_text';
      ordinal: number;
      tokenCount: number;
    }>;
    sourceItemId: string;
    updatedAt: Date;
  }): Promise<void>;
  resetOwnedJobForRetry(input: {
    jobId: string;
    queuedAt: Date;
    userId: string;
  }): Promise<{
    outcome: 'queued' | 'rejected';
    jobId: string;
    previousStatus: 'canceled' | 'failed' | 'queued' | 'running' | 'succeeded';
    sourceBlobId: string | null;
    sourceItemId: string | null;
    stage: IngestionJobStage;
    status: 'queued' | 'rejected';
  } | null>;
  startJob(input: { jobId: string; startedAt: Date }): Promise<{
    jobId: string;
    sourceBlobId: string | null;
    sourceItemId: string | null;
  } | null>;
};

export function createIngestionRepository(
  db: Db = getDb(),
): IngestionRepository {
  return {
    async completeJob(input) {
      await db.transaction(async (tx) => {
        await tx
          .update(sourceItems)
          .set({
            processedAt: input.finishedAt,
            status: 'ready',
            updatedAt: input.finishedAt,
          })
          .where(eq(sourceItems.id, input.sourceItemId));

        await tx
          .update(sourceBlobs)
          .set({
            extractedAt: input.finishedAt,
            extractionStatus: 'ready',
            updatedAt: input.finishedAt,
          })
          .where(eq(sourceBlobs.sourceItemId, input.sourceItemId));

        await tx
          .update(ingestionJobs)
          .set({
            errorCode: null,
            errorDetails: null,
            errorMessage: null,
            finishedAt: input.finishedAt,
            stage: 'complete',
            status: 'succeeded',
            updatedAt: input.finishedAt,
          })
          .where(eq(ingestionJobs.id, input.jobId));
      });
    },
    async createJob(input) {
      const [job] = await db
        .insert(ingestionJobs)
        .values({
          id: input.jobId,
          kind: 'ingest',
          maxAttempts: input.maxAttempts,
          payload: input.payload,
          sourceItemId: input.sourceItemId,
          spaceId: input.spaceId,
          stage: 'extract',
          status: 'queued',
        })
        .returning({
          jobId: ingestionJobs.id,
        });

      return job;
    },
    async failJob(input) {
      await db.transaction(async (tx) => {
        await tx
          .update(ingestionJobs)
          .set({
            errorCode: input.errorCode,
            errorDetails: input.errorDetails ?? null,
            errorMessage: input.errorMessage,
            finishedAt: input.failedAt,
            stage: input.stage,
            status: 'failed',
            updatedAt: input.failedAt,
          })
          .where(eq(ingestionJobs.id, input.jobId));

        if (input.sourceItemId) {
          await tx
            .update(sourceItems)
            .set({
              status: 'failed',
              updatedAt: input.failedAt,
            })
            .where(eq(sourceItems.id, input.sourceItemId));
        }

        if (input.sourceBlobId) {
          await tx
            .update(sourceBlobs)
            .set({
              extractionStatus: 'failed',
              updatedAt: input.failedAt,
            })
            .where(eq(sourceBlobs.id, input.sourceBlobId));
        }
      });
    },
    async getJobForProcessing(input) {
      const [job] = await db
        .select({
          attemptCount: ingestionJobs.attemptCount,
          jobId: ingestionJobs.id,
          maxAttempts: ingestionJobs.maxAttempts,
          payload: ingestionJobs.payload,
          sourceBlobId: sourceBlobs.id,
          sourceItemId: ingestionJobs.sourceItemId,
          sourceKind: sourceItems.kind,
          sourceMetadata: sourceItems.metadata,
          sourceTitle: sourceItems.title,
          spaceId: ingestionJobs.spaceId,
          stage: ingestionJobs.stage,
          status: ingestionJobs.status,
        })
        .from(ingestionJobs)
        .leftJoin(sourceItems, eq(ingestionJobs.sourceItemId, sourceItems.id))
        .leftJoin(
          sourceBlobs,
          and(
            eq(sourceBlobs.sourceItemId, sourceItems.id),
            isNull(sourceBlobs.deletedAt),
          ),
        )
        .where(eq(ingestionJobs.id, input.jobId))
        .limit(1);

      if (!job) {
        return null;
      }

      return {
        attemptCount: job.attemptCount,
        jobId: job.jobId,
        maxAttempts: job.maxAttempts,
        payload: job.payload ?? {},
        sourceBlobId: job.sourceBlobId ?? null,
        sourceItemId: job.sourceItemId ?? null,
        sourceKind:
          job.sourceKind === 'file' ||
          job.sourceKind === 'note' ||
          job.sourceKind === 'web_page'
            ? job.sourceKind
            : null,
        sourceMetadata: job.sourceMetadata ?? {},
        sourceTitle: job.sourceTitle,
        spaceId: job.spaceId,
        stage: job.stage,
        status: job.status,
      };
    },
    async listOwnedRecentJobs(input) {
      const jobs = await db
        .select({
          attemptCount: ingestionJobs.attemptCount,
          createdAt: ingestionJobs.createdAt,
          errorCode: ingestionJobs.errorCode,
          errorMessage: ingestionJobs.errorMessage,
          finishedAt: ingestionJobs.finishedAt,
          jobId: ingestionJobs.id,
          kind: ingestionJobs.kind,
          maxAttempts: ingestionJobs.maxAttempts,
          sourceItemId: ingestionJobs.sourceItemId,
          sourceKind: sourceItems.kind,
          sourceTitle: sourceItems.title,
          stage: ingestionJobs.stage,
          status: ingestionJobs.status,
          updatedAt: ingestionJobs.updatedAt,
        })
        .from(ingestionJobs)
        .innerJoin(spaces, eq(ingestionJobs.spaceId, spaces.id))
        .leftJoin(sourceItems, eq(ingestionJobs.sourceItemId, sourceItems.id))
        .where(
          and(
            eq(spaces.ownerUserId, input.userId),
            isNull(spaces.deletedAt),
            isNull(spaces.archivedAt),
          ),
        )
        .orderBy(desc(ingestionJobs.createdAt))
        .limit(input.limit);

      return jobs.map((job) => ({
        attemptCount: job.attemptCount,
        createdAt: job.createdAt.toISOString(),
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        jobId: job.jobId,
        kind: job.kind,
        maxAttempts: job.maxAttempts,
        sourceItemId: job.sourceItemId,
        sourceKind:
          job.sourceKind === 'file' ||
          job.sourceKind === 'note' ||
          job.sourceKind === 'web_page'
            ? job.sourceKind
            : null,
        sourceTitle: job.sourceTitle,
        stage: job.stage,
        status: job.status,
        updatedAt: job.updatedAt.toISOString(),
      }));
    },
    async getJobForDispatch(input) {
      const [job] = await db
        .select({
          attemptCount: ingestionJobs.attemptCount,
          jobId: ingestionJobs.id,
        })
        .from(ingestionJobs)
        .where(eq(ingestionJobs.id, input.jobId))
        .limit(1);

      return job ?? null;
    },
    async markJobStage(input) {
      await db
        .update(ingestionJobs)
        .set({
          stage: input.stage,
          updatedAt: input.updatedAt,
        })
        .where(eq(ingestionJobs.id, input.jobId));
    },
    async replaceSegments(input) {
      await db.transaction(async (tx) => {
        await tx
          .update(ingestionJobs)
          .set({
            stage: 'segment',
            updatedAt: input.updatedAt,
          })
          .where(eq(ingestionJobs.id, input.jobId));

        await tx
          .delete(segments)
          .where(eq(segments.sourceItemId, input.sourceItemId));

        if (input.segments.length > 0) {
          await tx.insert(segments).values(
            input.segments.map((segment) => ({
              content: segment.content,
              contentHash: segment.contentHash,
              id: segment.id,
              kind: segment.kind,
              ordinal: segment.ordinal,
              sourceItemId: input.sourceItemId,
              tokenCount: segment.tokenCount,
            })),
          );
        }
      });
    },
    async resetOwnedJobForRetry(input) {
      return db.transaction(async (tx) => {
        const [job] = await tx
          .select({
            previousStatus: ingestionJobs.status,
            sourceBlobId: sourceBlobs.id,
            sourceItemId: ingestionJobs.sourceItemId,
          })
          .from(ingestionJobs)
          .innerJoin(spaces, eq(ingestionJobs.spaceId, spaces.id))
          .leftJoin(
            sourceBlobs,
            and(
              eq(sourceBlobs.sourceItemId, ingestionJobs.sourceItemId),
              isNull(sourceBlobs.deletedAt),
            ),
          )
          .where(
            and(
              eq(ingestionJobs.id, input.jobId),
              eq(spaces.ownerUserId, input.userId),
              isNull(spaces.deletedAt),
              isNull(spaces.archivedAt),
            ),
          )
          .limit(1);

        if (!job) {
          return null;
        }

        if (job.previousStatus !== 'failed') {
          return {
            outcome: 'rejected' as const,
            jobId: input.jobId,
            previousStatus: job.previousStatus,
            sourceBlobId: job.sourceBlobId ?? null,
            sourceItemId: job.sourceItemId ?? null,
            stage: 'extract' as const,
            status: 'rejected' as const,
          };
        }

        const [updatedJob] = await tx
          .update(ingestionJobs)
          .set({
            errorCode: null,
            errorDetails: null,
            errorMessage: null,
            finishedAt: null,
            stage: 'extract',
            startedAt: null,
            status: 'queued',
            updatedAt: input.queuedAt,
          })
          .where(
            and(
              eq(ingestionJobs.id, input.jobId),
              eq(ingestionJobs.status, 'failed'),
            ),
          )
          .returning({
            jobId: ingestionJobs.id,
            stage: ingestionJobs.stage,
          });

        if (!updatedJob) {
          return {
            outcome: 'rejected' as const,
            jobId: input.jobId,
            previousStatus: job.previousStatus,
            sourceBlobId: job.sourceBlobId ?? null,
            sourceItemId: job.sourceItemId ?? null,
            stage: 'extract' as const,
            status: 'rejected' as const,
          };
        }

        if (job.sourceItemId) {
          await tx
            .update(sourceItems)
            .set({
              status: 'pending',
              updatedAt: input.queuedAt,
            })
            .where(eq(sourceItems.id, job.sourceItemId));
        }

        if (job.sourceBlobId) {
          await tx
            .update(sourceBlobs)
            .set({
              extractionStatus: 'pending',
              updatedAt: input.queuedAt,
            })
            .where(eq(sourceBlobs.id, job.sourceBlobId));
        }

        return {
          outcome: 'queued' as const,
          jobId: updatedJob.jobId,
          previousStatus: job.previousStatus,
          sourceBlobId: job.sourceBlobId ?? null,
          sourceItemId: job.sourceItemId ?? null,
          stage: updatedJob.stage,
          status: 'queued',
        };
      });
    },
    async startJob(input) {
      return db.transaction(async (tx) => {
        const [job] = await tx
          .update(ingestionJobs)
          .set({
            attemptCount: sql`${ingestionJobs.attemptCount} + 1`,
            errorCode: null,
            errorDetails: null,
            errorMessage: null,
            finishedAt: null,
            stage: 'extract',
            startedAt: input.startedAt,
            status: 'running',
            updatedAt: input.startedAt,
          })
          .where(
            and(
              eq(ingestionJobs.id, input.jobId),
              eq(ingestionJobs.status, 'queued'),
            ),
          )
          .returning({
            jobId: ingestionJobs.id,
            sourceItemId: ingestionJobs.sourceItemId,
          });

        if (!job) {
          return null;
        }

        if (job.sourceItemId) {
          await tx
            .update(sourceItems)
            .set({
              status: 'processing',
              updatedAt: input.startedAt,
            })
            .where(eq(sourceItems.id, job.sourceItemId));

          const [blob] = await tx
            .update(sourceBlobs)
            .set({
              extractionStatus: 'processing',
              updatedAt: input.startedAt,
            })
            .where(eq(sourceBlobs.sourceItemId, job.sourceItemId))
            .returning({
              sourceBlobId: sourceBlobs.id,
            });

          return {
            jobId: job.jobId,
            sourceBlobId: blob?.sourceBlobId ?? null,
            sourceItemId: job.sourceItemId,
          };
        }

        return {
          jobId: job.jobId,
          sourceBlobId: null,
          sourceItemId: null,
        };
      });
    },
  };
}
