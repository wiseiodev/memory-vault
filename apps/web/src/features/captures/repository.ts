import 'server-only';

import { and, desc, eq, isNull } from 'drizzle-orm';

import { getDb } from '@/db';
import { ingestionJobs, sourceBlobs, sourceItems, spaces } from '@/db/schema';

type Db = ReturnType<typeof getDb>;

export type ExtensionCaptureRecord = {
  capturedAt: string;
  kind: 'note' | 'web_page';
  sourceBlobContentType: string | null;
  sourceBlobId: string | null;
  sourceBlobObjectKey: string | null;
  sourceBlobUploadedAt: string | null;
  sourceItemId: string;
  spaceId: string;
  status: 'failed' | 'pending' | 'processing' | 'ready';
};

export type CaptureRepository = {
  abandonWebCaptureReservation(input: {
    captureRequestId: string;
    deletedAt: Date;
    sourceBlobId: string;
    sourceItemId: string;
    spaceId: string;
    userId: string;
  }): Promise<boolean>;
  createCapture(input: {
    canonicalUri: string | null;
    capturedAt: Date;
    connectorKey?: string;
    externalId?: string;
    ingestionJob: {
      id: string;
      maxAttempts: number;
      payload: Record<string, unknown>;
    };
    kind: 'note' | 'web_page';
    metadata: Record<string, unknown>;
    sourceItemId: string;
    spaceId: string;
    title: string | null;
    userId: string;
  }): Promise<{
    capturedAt: string;
    jobId: string;
    kind: 'note' | 'web_page';
    sourceItemId: string;
    spaceId: string;
    status: 'pending';
  }>;
  createWebCaptureReservation(input: {
    byteSize: bigint;
    canonicalUri: string;
    capturedAt: Date;
    connectorKey: 'chrome_extension';
    contentType: string;
    externalId: string;
    metadata: Record<string, unknown>;
    objectKey: string;
    sourceBlobId: string;
    sourceItemId: string;
    spaceId: string;
    title: string | null;
    userId: string;
  }): Promise<{
    capturedAt: string;
    sourceBlobId: string;
    sourceItemId: string;
    spaceId: string;
    status: 'pending';
  }>;
  finalizeWebCaptureReservation(input: {
    byteSize: bigint;
    captureRequestId: string;
    contentType: string | null;
    etag: string | null;
    ingestionJob: {
      id: string;
      maxAttempts: number;
      payload: Record<string, unknown>;
    };
    sourceBlobId: string;
    sourceItemId: string;
    spaceId: string;
    uploadedAt: Date;
    userId: string;
  }): Promise<ExtensionCaptureRecord | null>;
  findExtensionCaptureByExternalId(input: {
    captureRequestId: string;
    spaceId: string;
    userId: string;
  }): Promise<ExtensionCaptureRecord | null>;
};

function toStatus(
  value: string,
): 'failed' | 'pending' | 'processing' | 'ready' {
  if (value === 'failed') {
    return 'failed';
  }

  if (value === 'processing') {
    return 'processing';
  }

  if (value === 'ready') {
    return 'ready';
  }

  return 'pending';
}

function toCapturedAt(input: { capturedAt: Date | null; createdAt: Date }) {
  return (input.capturedAt ?? input.createdAt).toISOString();
}

export function createCaptureRepository(db: Db = getDb()): CaptureRepository {
  return {
    async abandonWebCaptureReservation(input) {
      return db.transaction(async (tx) => {
        const [capture] = await tx
          .select({
            sourceBlobId: sourceBlobs.id,
            sourceItemId: sourceItems.id,
          })
          .from(sourceItems)
          .innerJoin(spaces, eq(sourceItems.spaceId, spaces.id))
          .leftJoin(
            sourceBlobs,
            and(
              eq(sourceBlobs.sourceItemId, sourceItems.id),
              eq(sourceBlobs.id, input.sourceBlobId),
              isNull(sourceBlobs.deletedAt),
            ),
          )
          .where(
            and(
              eq(sourceItems.id, input.sourceItemId),
              eq(sourceItems.spaceId, input.spaceId),
              eq(sourceItems.createdByUserId, input.userId),
              eq(sourceItems.connectorKey, 'chrome_extension'),
              eq(sourceItems.externalId, input.captureRequestId),
              eq(spaces.ownerUserId, input.userId),
              eq(sourceItems.status, 'pending'),
              isNull(sourceItems.deletedAt),
              isNull(spaces.deletedAt),
              isNull(spaces.archivedAt),
            ),
          )
          .limit(1);

        if (!capture) {
          return false;
        }

        await tx
          .update(sourceBlobs)
          .set({
            deletedAt: input.deletedAt,
            extractionStatus: 'failed',
            updatedAt: input.deletedAt,
          })
          .where(
            and(
              eq(sourceBlobs.id, input.sourceBlobId),
              eq(sourceBlobs.sourceItemId, input.sourceItemId),
              isNull(sourceBlobs.deletedAt),
            ),
          );

        await tx
          .update(sourceItems)
          .set({
            deletedAt: input.deletedAt,
            status: 'failed',
            updatedAt: input.deletedAt,
          })
          .where(
            and(
              eq(sourceItems.id, input.sourceItemId),
              eq(sourceItems.status, 'pending'),
              isNull(sourceItems.deletedAt),
            ),
          );

        return true;
      });
    },
    async createCapture(input) {
      const [createdSourceItem] = await db.transaction(async (tx) => {
        const [sourceItem] = await tx
          .insert(sourceItems)
          .values({
            canonicalUri: input.canonicalUri,
            capturedAt: input.capturedAt,
            connectorKey: input.connectorKey,
            createdByUserId: input.userId,
            externalId: input.externalId,
            id: input.sourceItemId,
            kind: input.kind,
            metadata: input.metadata,
            spaceId: input.spaceId,
            status: 'pending',
            title: input.title,
            updatedAt: input.capturedAt,
          })
          .returning({
            capturedAt: sourceItems.capturedAt,
            createdAt: sourceItems.createdAt,
            kind: sourceItems.kind,
            sourceItemId: sourceItems.id,
            spaceId: sourceItems.spaceId,
            status: sourceItems.status,
          });

        await tx.insert(ingestionJobs).values({
          id: input.ingestionJob.id,
          kind: 'ingest',
          maxAttempts: input.ingestionJob.maxAttempts,
          payload: input.ingestionJob.payload,
          sourceItemId: input.sourceItemId,
          spaceId: input.spaceId,
          stage: 'extract',
          status: 'queued',
        });

        return [sourceItem];
      });

      return {
        capturedAt: toCapturedAt({
          capturedAt: createdSourceItem.capturedAt,
          createdAt: createdSourceItem.createdAt,
        }),
        jobId: input.ingestionJob.id,
        kind: createdSourceItem.kind as 'note' | 'web_page',
        sourceItemId: createdSourceItem.sourceItemId,
        spaceId: createdSourceItem.spaceId,
        status: 'pending',
      };
    },
    async createWebCaptureReservation(input) {
      return db.transaction(async (tx) => {
        const [sourceItem] = await tx
          .insert(sourceItems)
          .values({
            canonicalUri: input.canonicalUri,
            capturedAt: input.capturedAt,
            connectorKey: input.connectorKey,
            createdByUserId: input.userId,
            externalId: input.externalId,
            id: input.sourceItemId,
            kind: 'web_page',
            metadata: input.metadata,
            mimeType: input.contentType,
            spaceId: input.spaceId,
            status: 'pending',
            title: input.title,
            updatedAt: input.capturedAt,
          })
          .returning({
            capturedAt: sourceItems.capturedAt,
            createdAt: sourceItems.createdAt,
            sourceItemId: sourceItems.id,
            spaceId: sourceItems.spaceId,
            status: sourceItems.status,
          });

        await tx.insert(sourceBlobs).values({
          byteSize: input.byteSize,
          contentType: input.contentType,
          id: input.sourceBlobId,
          metadata: {
            captureRequestId: input.externalId,
            snapshotKind: 'html',
          },
          objectKey: input.objectKey,
          sourceItemId: input.sourceItemId,
          storageProvider: 's3',
        });

        return {
          capturedAt: toCapturedAt({
            capturedAt: sourceItem.capturedAt,
            createdAt: sourceItem.createdAt,
          }),
          sourceBlobId: input.sourceBlobId,
          sourceItemId: sourceItem.sourceItemId,
          spaceId: sourceItem.spaceId,
          status: 'pending' as const,
        };
      });
    },
    async finalizeWebCaptureReservation(input) {
      return db.transaction(async (tx) => {
        const [capture] = await tx
          .select({
            capturedAt: sourceItems.capturedAt,
            createdAt: sourceItems.createdAt,
            kind: sourceItems.kind,
            sourceItemId: sourceItems.id,
            sourceStatus: sourceItems.status,
            spaceId: sourceItems.spaceId,
          })
          .from(sourceItems)
          .innerJoin(spaces, eq(sourceItems.spaceId, spaces.id))
          .innerJoin(
            sourceBlobs,
            and(
              eq(sourceBlobs.sourceItemId, sourceItems.id),
              eq(sourceBlobs.id, input.sourceBlobId),
              isNull(sourceBlobs.deletedAt),
            ),
          )
          .where(
            and(
              eq(sourceItems.id, input.sourceItemId),
              eq(sourceItems.spaceId, input.spaceId),
              eq(sourceItems.createdByUserId, input.userId),
              eq(sourceItems.connectorKey, 'chrome_extension'),
              eq(sourceItems.externalId, input.captureRequestId),
              eq(spaces.ownerUserId, input.userId),
              eq(sourceItems.status, 'pending'),
              isNull(sourceItems.deletedAt),
              isNull(spaces.deletedAt),
              isNull(spaces.archivedAt),
            ),
          )
          .limit(1);

        if (!capture) {
          return null;
        }

        await tx
          .update(sourceBlobs)
          .set({
            byteSize: input.byteSize,
            contentType: input.contentType,
            etag: input.etag,
            extractionStatus: 'pending',
            updatedAt: input.uploadedAt,
            uploadedAt: input.uploadedAt,
          })
          .where(
            and(
              eq(sourceBlobs.id, input.sourceBlobId),
              eq(sourceBlobs.sourceItemId, input.sourceItemId),
              isNull(sourceBlobs.deletedAt),
            ),
          );

        await tx
          .update(sourceItems)
          .set({
            mimeType: input.contentType,
            updatedAt: input.uploadedAt,
          })
          .where(
            and(
              eq(sourceItems.id, input.sourceItemId),
              eq(sourceItems.status, 'pending'),
              isNull(sourceItems.deletedAt),
            ),
          );

        await tx
          .insert(ingestionJobs)
          .values({
            id: input.ingestionJob.id,
            kind: 'ingest',
            maxAttempts: input.ingestionJob.maxAttempts,
            payload: input.ingestionJob.payload,
            sourceItemId: input.sourceItemId,
            spaceId: input.spaceId,
            stage: 'extract',
            status: 'queued',
          })
          .onConflictDoNothing();

        return {
          capturedAt: toCapturedAt({
            capturedAt: capture.capturedAt,
            createdAt: capture.createdAt,
          }),
          kind: capture.kind === 'note' ? 'note' : 'web_page',
          sourceBlobContentType: input.contentType,
          sourceBlobId: input.sourceBlobId,
          sourceBlobObjectKey: null,
          sourceBlobUploadedAt: input.uploadedAt.toISOString(),
          sourceItemId: capture.sourceItemId,
          spaceId: capture.spaceId,
          status: toStatus(capture.sourceStatus),
        };
      });
    },
    async findExtensionCaptureByExternalId(input) {
      const [sourceItem] = await db
        .select({
          capturedAt: sourceItems.capturedAt,
          createdAt: sourceItems.createdAt,
          kind: sourceItems.kind,
          sourceItemId: sourceItems.id,
          sourceStatus: sourceItems.status,
          spaceId: sourceItems.spaceId,
        })
        .from(sourceItems)
        .innerJoin(spaces, eq(sourceItems.spaceId, spaces.id))
        .where(
          and(
            eq(sourceItems.connectorKey, 'chrome_extension'),
            eq(sourceItems.externalId, input.captureRequestId),
            eq(sourceItems.spaceId, input.spaceId),
            eq(sourceItems.createdByUserId, input.userId),
            eq(spaces.ownerUserId, input.userId),
            isNull(sourceItems.deletedAt),
            isNull(spaces.deletedAt),
            isNull(spaces.archivedAt),
          ),
        )
        .limit(1);

      if (!sourceItem) {
        return null;
      }

      const [sourceBlob] = await db
        .select({
          contentType: sourceBlobs.contentType,
          createdAt: sourceBlobs.createdAt,
          objectKey: sourceBlobs.objectKey,
          sourceBlobId: sourceBlobs.id,
          uploadedAt: sourceBlobs.uploadedAt,
        })
        .from(sourceBlobs)
        .where(
          and(
            eq(sourceBlobs.sourceItemId, sourceItem.sourceItemId),
            isNull(sourceBlobs.deletedAt),
          ),
        )
        .orderBy(desc(sourceBlobs.createdAt))
        .limit(1);

      return {
        capturedAt: toCapturedAt({
          capturedAt: sourceItem.capturedAt,
          createdAt: sourceItem.createdAt,
        }),
        kind: sourceItem.kind === 'note' ? 'note' : 'web_page',
        sourceBlobContentType: sourceBlob?.contentType ?? null,
        sourceBlobId: sourceBlob?.sourceBlobId ?? null,
        sourceBlobObjectKey: sourceBlob?.objectKey ?? null,
        sourceBlobUploadedAt: sourceBlob?.uploadedAt?.toISOString() ?? null,
        sourceItemId: sourceItem.sourceItemId,
        spaceId: sourceItem.spaceId,
        status: toStatus(sourceItem.sourceStatus),
      };
    },
  };
}
