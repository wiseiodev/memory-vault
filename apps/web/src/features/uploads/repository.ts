import 'server-only';

import { and, desc, eq, isNull } from 'drizzle-orm';

import { getDb } from '@/db';
import { ingestionJobs, sourceBlobs, sourceItems, spaces } from '@/db/schema';

type Db = ReturnType<typeof getDb>;

export type UploadRepository = {
  abandonReservation(input: {
    abandonedAt: Date;
    sourceBlobId: string;
    sourceItemId: string;
  }): Promise<void>;
  createReservation(input: {
    blobId: string;
    bucket?: string;
    byteSize: bigint;
    contentType: string;
    filename: string;
    objectKey: string;
    spaceId: string;
    sourceItemId: string;
    userId: string;
  }): Promise<{
    id: string;
    objectKey: string;
    sourceItemId: string;
  }>;
  deleteOwnedUpload(input: {
    deletedAt: Date;
    sourceBlobId: string;
    sourceItemId: string;
    userId: string;
  }): Promise<boolean>;
  finalizeOwnedUpload(input: {
    byteSize: bigint;
    contentType: string | null;
    etag: string | null;
    ingestionJob: {
      id: string;
      maxAttempts: number;
      payload: Record<string, unknown>;
    };
    sourceBlobId: string;
    sourceItemId: string;
    uploadedAt: Date;
    userId: string;
  }): Promise<{
    bucket: string | null;
    byteSize: bigint | null;
    contentType: string | null;
    etag: string | null;
    ingestionJobId: string;
    objectKey: string;
    sourceBlobId: string;
    sourceItemId: string;
    spaceId: string;
    uploadedAt: string | null;
  } | null>;
  findOwnedBlobForCompletion(input: {
    sourceBlobId: string;
    sourceItemId: string;
    userId: string;
  }): Promise<{
    bucket: string | null;
    objectKey: string;
    sourceBlobId: string;
    sourceItemId: string;
    spaceId: string;
  } | null>;
  findOwnedBlobForDownload(input: {
    sourceBlobId: string;
    userId: string;
  }): Promise<{
    objectKey: string;
    uploadedAt: Date | null;
  } | null>;
  listOwnedUploads(input: { userId: string }): Promise<
    Array<{
      byteSize: bigint | null;
      contentType: string | null;
      createdAt: string;
      filename: string;
      objectKey: string;
      sourceBlobId: string;
      sourceItemId: string;
      sourceStatus: 'archived' | 'failed' | 'pending' | 'processing' | 'ready';
      uploadedAt: string | null;
    }>
  >;
};

export function createUploadRepository(db: Db = getDb()): UploadRepository {
  return {
    async abandonReservation(input) {
      await db.transaction(async (tx) => {
        await tx
          .update(sourceBlobs)
          .set({
            deletedAt: input.abandonedAt,
            extractionStatus: 'failed',
            updatedAt: input.abandonedAt,
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
            deletedAt: input.abandonedAt,
            status: 'failed',
            updatedAt: input.abandonedAt,
          })
          .where(
            and(
              eq(sourceItems.id, input.sourceItemId),
              isNull(sourceItems.deletedAt),
            ),
          );
      });
    },
    async createReservation(input) {
      return db.transaction(async (tx) => {
        const [createdSourceItem] = await tx
          .insert(sourceItems)
          .values({
            id: input.sourceItemId,
            createdByUserId: input.userId,
            kind: 'file',
            metadata: {
              originalFilename: input.filename,
            },
            mimeType: input.contentType,
            spaceId: input.spaceId,
            status: 'pending',
            title: input.filename,
          })
          .returning({
            id: sourceItems.id,
            spaceId: sourceItems.spaceId,
          });

        const [createdBlob] = await tx
          .insert(sourceBlobs)
          .values({
            id: input.blobId,
            bucket: input.bucket,
            byteSize: input.byteSize,
            contentType: input.contentType,
            metadata: {
              originalFilename: input.filename,
            },
            objectKey: input.objectKey,
            sourceItemId: createdSourceItem.id,
            storageProvider: 's3',
          })
          .returning({
            id: sourceBlobs.id,
            objectKey: sourceBlobs.objectKey,
            sourceItemId: sourceBlobs.sourceItemId,
          });

        return createdBlob;
      });
    },
    async deleteOwnedUpload(input) {
      return db.transaction(async (tx) => {
        const [ownedUpload] = await tx
          .select({
            sourceBlobId: sourceBlobs.id,
            sourceItemId: sourceItems.id,
          })
          .from(sourceBlobs)
          .innerJoin(sourceItems, eq(sourceBlobs.sourceItemId, sourceItems.id))
          .innerJoin(spaces, eq(sourceItems.spaceId, spaces.id))
          .where(
            and(
              eq(sourceBlobs.id, input.sourceBlobId),
              eq(sourceItems.id, input.sourceItemId),
              eq(spaces.ownerUserId, input.userId),
              isNull(sourceBlobs.deletedAt),
              isNull(sourceItems.deletedAt),
              isNull(spaces.deletedAt),
              isNull(spaces.archivedAt),
            ),
          )
          .limit(1);

        if (!ownedUpload) {
          return false;
        }

        await tx
          .update(sourceBlobs)
          .set({
            archivedAt: input.deletedAt,
            deletedAt: input.deletedAt,
            updatedAt: input.deletedAt,
          })
          .where(eq(sourceBlobs.id, input.sourceBlobId));

        await tx
          .update(sourceItems)
          .set({
            archivedAt: input.deletedAt,
            deletedAt: input.deletedAt,
            status: 'archived',
            updatedAt: input.deletedAt,
          })
          .where(eq(sourceItems.id, input.sourceItemId));

        return true;
      });
    },
    async finalizeOwnedUpload(input) {
      return db.transaction(async (tx) => {
        const [ownedBlob] = await tx
          .select({
            bucket: sourceBlobs.bucket,
            byteSize: sourceBlobs.byteSize,
            contentType: sourceBlobs.contentType,
            etag: sourceBlobs.etag,
            objectKey: sourceBlobs.objectKey,
            sourceBlobId: sourceBlobs.id,
            sourceItemId: sourceItems.id,
            spaceId: sourceItems.spaceId,
            uploadedAt: sourceBlobs.uploadedAt,
          })
          .from(sourceBlobs)
          .innerJoin(sourceItems, eq(sourceBlobs.sourceItemId, sourceItems.id))
          .innerJoin(spaces, eq(sourceItems.spaceId, spaces.id))
          .where(
            and(
              eq(sourceBlobs.id, input.sourceBlobId),
              eq(sourceItems.id, input.sourceItemId),
              eq(spaces.ownerUserId, input.userId),
              isNull(sourceBlobs.deletedAt),
              isNull(sourceItems.deletedAt),
              isNull(spaces.deletedAt),
              isNull(spaces.archivedAt),
            ),
          )
          .limit(1);

        if (!ownedBlob) {
          return null;
        }

        const finalBlob =
          ownedBlob.uploadedAt === null
            ? await tx
                .update(sourceBlobs)
                .set({
                  byteSize: input.byteSize,
                  contentType: input.contentType,
                  etag: input.etag,
                  updatedAt: input.uploadedAt,
                  uploadedAt: input.uploadedAt,
                })
                .where(
                  and(
                    eq(sourceBlobs.id, input.sourceBlobId),
                    isNull(sourceBlobs.deletedAt),
                    isNull(sourceBlobs.uploadedAt),
                  ),
                )
                .returning({
                  bucket: sourceBlobs.bucket,
                  byteSize: sourceBlobs.byteSize,
                  contentType: sourceBlobs.contentType,
                  etag: sourceBlobs.etag,
                  objectKey: sourceBlobs.objectKey,
                  sourceBlobId: sourceBlobs.id,
                  uploadedAt: sourceBlobs.uploadedAt,
                })
                .then((rows) => rows[0] ?? null)
            : {
                bucket: ownedBlob.bucket,
                byteSize: ownedBlob.byteSize,
                contentType: ownedBlob.contentType,
                etag: ownedBlob.etag,
                objectKey: ownedBlob.objectKey,
                sourceBlobId: ownedBlob.sourceBlobId,
                uploadedAt: ownedBlob.uploadedAt,
              };

        if (!finalBlob) {
          throw new Error('Source blob disappeared during upload completion.');
        }

        await tx
          .update(sourceItems)
          .set({
            capturedAt: input.uploadedAt,
            updatedAt: input.uploadedAt,
          })
          .where(
            and(
              eq(sourceItems.id, input.sourceItemId),
              isNull(sourceItems.deletedAt),
              isNull(sourceItems.capturedAt),
            ),
          );

        const [existingJob] = await tx
          .select({
            jobId: ingestionJobs.id,
          })
          .from(ingestionJobs)
          .where(
            and(
              eq(ingestionJobs.sourceItemId, input.sourceItemId),
              eq(ingestionJobs.kind, 'ingest'),
            ),
          )
          .limit(1);

        const ingestionJobId =
          existingJob?.jobId ??
          (
            await tx
              .insert(ingestionJobs)
              .values({
                id: input.ingestionJob.id,
                kind: 'ingest',
                maxAttempts: input.ingestionJob.maxAttempts,
                payload: input.ingestionJob.payload,
                sourceItemId: input.sourceItemId,
                spaceId: ownedBlob.spaceId,
                stage: 'extract',
                status: 'queued',
              })
              .returning({
                jobId: ingestionJobs.id,
              })
          )[0].jobId;

        return {
          ...finalBlob,
          ingestionJobId,
          sourceItemId: ownedBlob.sourceItemId,
          spaceId: ownedBlob.spaceId,
          uploadedAt: finalBlob.uploadedAt?.toISOString() ?? null,
        };
      });
    },
    async findOwnedBlobForCompletion(input) {
      const [ownedBlob] = await db
        .select({
          bucket: sourceBlobs.bucket,
          objectKey: sourceBlobs.objectKey,
          sourceBlobId: sourceBlobs.id,
          sourceItemId: sourceItems.id,
          spaceId: sourceItems.spaceId,
        })
        .from(sourceBlobs)
        .innerJoin(sourceItems, eq(sourceBlobs.sourceItemId, sourceItems.id))
        .innerJoin(spaces, eq(sourceItems.spaceId, spaces.id))
        .where(
          and(
            eq(sourceBlobs.id, input.sourceBlobId),
            eq(sourceItems.id, input.sourceItemId),
            eq(spaces.ownerUserId, input.userId),
            isNull(sourceBlobs.deletedAt),
            isNull(sourceItems.deletedAt),
            isNull(spaces.deletedAt),
            isNull(spaces.archivedAt),
          ),
        )
        .limit(1);

      return ownedBlob ?? null;
    },
    async findOwnedBlobForDownload(input) {
      const [ownedBlob] = await db
        .select({
          objectKey: sourceBlobs.objectKey,
          uploadedAt: sourceBlobs.uploadedAt,
        })
        .from(sourceBlobs)
        .innerJoin(sourceItems, eq(sourceBlobs.sourceItemId, sourceItems.id))
        .innerJoin(spaces, eq(sourceItems.spaceId, spaces.id))
        .where(
          and(
            eq(sourceBlobs.id, input.sourceBlobId),
            eq(spaces.ownerUserId, input.userId),
            isNull(sourceBlobs.deletedAt),
            isNull(sourceItems.deletedAt),
            isNull(spaces.deletedAt),
            isNull(spaces.archivedAt),
          ),
        )
        .limit(1);

      return ownedBlob ?? null;
    },
    async listOwnedUploads(input) {
      const uploads = await db
        .select({
          byteSize: sourceBlobs.byteSize,
          contentType: sourceBlobs.contentType,
          createdAt: sourceItems.createdAt,
          filename: sourceItems.title,
          objectKey: sourceBlobs.objectKey,
          sourceBlobId: sourceBlobs.id,
          sourceItemId: sourceItems.id,
          sourceStatus: sourceItems.status,
          uploadedAt: sourceBlobs.uploadedAt,
        })
        .from(sourceBlobs)
        .innerJoin(sourceItems, eq(sourceBlobs.sourceItemId, sourceItems.id))
        .innerJoin(spaces, eq(sourceItems.spaceId, spaces.id))
        .where(
          and(
            eq(spaces.ownerUserId, input.userId),
            isNull(sourceBlobs.deletedAt),
            isNull(sourceItems.deletedAt),
            isNull(spaces.deletedAt),
            isNull(spaces.archivedAt),
          ),
        )
        .orderBy(desc(sourceItems.createdAt));

      return uploads.map((upload) => ({
        ...upload,
        createdAt: upload.createdAt.toISOString(),
        filename: upload.filename ?? 'Untitled file',
        uploadedAt: upload.uploadedAt?.toISOString() ?? null,
      }));
    },
  };
}
