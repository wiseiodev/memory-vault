import 'server-only';

import { ORPCError } from '@orpc/server';
import { generateId } from '@/db/columns/id';
import { createSpaceRepository } from '@/features/spaces';
import { getRequestLogger } from '@/lib/evlog';
import { buildSourceBlobObjectKey } from './object-key';
import { createUploadRepository, type UploadRepository } from './repository';
import {
  resolveUploadSpace,
  type UploadSpaceRepository,
} from './space-resolution';
import {
  createPresignedDownload,
  createPresignedUpload,
  deleteObject,
  getStorageConfig,
  headObject,
} from './storage';

type ReserveUploadInput = {
  byteSize: number;
  contentType: string;
  filename: string;
  spaceId?: string;
  userId: string;
};

type CompleteUploadInput = {
  sourceBlobId: string;
  sourceItemId: string;
  userId: string;
};

type ServiceDeps = {
  createPresignedDownload?: typeof createPresignedDownload;
  createPresignedUpload?: typeof createPresignedUpload;
  deleteObject?: typeof deleteObject;
  now: () => Date;
  repository: UploadRepository;
  storageConfig?: {
    bucket: string;
  };
  storage?: {
    headObject: typeof headObject;
  };
};

export type UploadListItem = {
  byteSize: string | null;
  contentType: string | null;
  createdAt: string;
  filename: string;
  objectKey: string;
  sourceBlobId: string;
  sourceItemId: string;
  status: 'failed' | 'pending' | 'uploaded';
  uploadedAt: string | null;
};

export async function reserveUpload(
  input: ReserveUploadInput,
  deps: Pick<
    ServiceDeps,
    'createPresignedUpload' | 'now' | 'repository' | 'storageConfig'
  > & { spaceRepository: UploadSpaceRepository } = {
    createPresignedUpload,
    now: () => new Date(),
    repository: createUploadRepository(),
    spaceRepository: createSpaceRepository(),
  },
) {
  const space = await resolveUploadSpace({
    requestedSpaceId: input.spaceId,
    repository: deps.spaceRepository,
    userId: input.userId,
  });
  const blobId = generateId('blob');
  const sourceItemId = generateId('src');
  const objectKey = buildSourceBlobObjectKey({
    filename: input.filename,
    sourceBlobId: blobId,
    sourceItemId,
    spaceId: space.id,
  });
  const createdSourceBlob = await deps.repository.createReservation({
    blobId,
    bucket: (deps.storageConfig ?? getStorageConfig()).bucket,
    byteSize: BigInt(input.byteSize),
    contentType: input.contentType,
    filename: input.filename,
    objectKey,
    spaceId: space.id,
    sourceItemId,
    userId: input.userId,
  });

  try {
    if (
      createdSourceBlob.id !== blobId ||
      createdSourceBlob.objectKey !== objectKey ||
      createdSourceBlob.sourceItemId !== sourceItemId
    ) {
      throw new Error(
        'Reserved blob object key does not match the canonical path.',
      );
    }

    const presignedUpload = await (
      deps.createPresignedUpload ?? createPresignedUpload
    )({
      contentType: input.contentType,
      objectKey,
    });

    return {
      objectKey,
      sourceBlobId: createdSourceBlob.id,
      sourceItemId: sourceItemId,
      spaceId: space.id,
      uploadHeaders: presignedUpload.uploadHeaders,
      uploadMethod: 'PUT' as const,
      uploadUrl: presignedUpload.uploadUrl,
    };
  } catch (error) {
    try {
      await deps.repository.abandonReservation({
        abandonedAt: deps.now(),
        sourceBlobId: blobId,
        sourceItemId,
      });
    } catch (cleanupError) {
      getRequestLogger().error(
        cleanupError instanceof Error
          ? cleanupError
          : new Error('Unknown upload cleanup failure'),
        {
          action: 'upload.reservation.cleanup_failed',
          sourceBlobId: blobId,
          sourceItemId,
        },
      );
    }
    throw error;
  }
}

export async function completeUpload(
  input: CompleteUploadInput,
  deps: ServiceDeps = {
    now: () => new Date(),
    repository: createUploadRepository(),
    storage: {
      headObject,
    },
  },
) {
  const ownedBlob = await deps.repository.findOwnedBlobForCompletion({
    sourceBlobId: input.sourceBlobId,
    sourceItemId: input.sourceItemId,
    userId: input.userId,
  });

  if (!ownedBlob) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Upload not found for this user.',
    });
  }

  const headedObject = await (deps.storage ?? { headObject }).headObject({
    objectKey: ownedBlob.objectKey,
  });

  if (!headedObject) {
    throw new ORPCError('CONFLICT', {
      message: 'Uploaded object was not found in storage.',
    });
  }

  const completedAt = deps.now();
  const updatedBlob = await deps.repository.finalizeOwnedUpload({
    byteSize: headedObject.byteSize,
    contentType: headedObject.contentType,
    etag: headedObject.etag,
    sourceBlobId: input.sourceBlobId,
    sourceItemId: input.sourceItemId,
    uploadedAt: completedAt,
    userId: input.userId,
  });

  if (!updatedBlob) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Upload not found for this user.',
    });
  }

  return {
    bucket: updatedBlob.bucket,
    byteSize: updatedBlob.byteSize?.toString() ?? null,
    contentType: updatedBlob.contentType,
    etag: updatedBlob.etag,
    objectKey: updatedBlob.objectKey,
    sourceBlobId: updatedBlob.sourceBlobId,
    sourceItemId: updatedBlob.sourceItemId,
    spaceId: updatedBlob.spaceId,
    uploadedAt: updatedBlob.uploadedAt,
  };
}

export async function deleteUpload(
  input: CompleteUploadInput,
  deps: Pick<ServiceDeps, 'deleteObject' | 'now' | 'repository'> = {
    deleteObject,
    now: () => new Date(),
    repository: createUploadRepository(),
  },
) {
  const ownedBlob = await deps.repository.findOwnedBlobForCompletion({
    sourceBlobId: input.sourceBlobId,
    sourceItemId: input.sourceItemId,
    userId: input.userId,
  });

  if (!ownedBlob) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Upload not found for this user.',
    });
  }

  await (deps.deleteObject ?? deleteObject)({
    objectKey: ownedBlob.objectKey,
  });

  const deleted = await deps.repository.deleteOwnedUpload({
    deletedAt: deps.now(),
    sourceBlobId: input.sourceBlobId,
    sourceItemId: input.sourceItemId,
    userId: input.userId,
  });

  if (!deleted) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Upload not found for this user.',
    });
  }

  return {
    deleted: true as const,
    sourceBlobId: input.sourceBlobId,
    sourceItemId: input.sourceItemId,
  };
}

export async function getDownloadUrl(
  input: Pick<CompleteUploadInput, 'sourceBlobId' | 'userId'>,
  deps: Pick<ServiceDeps, 'createPresignedDownload' | 'repository'> = {
    createPresignedDownload,
    repository: createUploadRepository(),
  },
) {
  const ownedBlob = await deps.repository.findOwnedBlobForDownload({
    sourceBlobId: input.sourceBlobId,
    userId: input.userId,
  });

  if (!ownedBlob) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Upload not found for this user.',
    });
  }

  if (!ownedBlob.uploadedAt) {
    throw new ORPCError('CONFLICT', {
      message: 'Only uploaded files can be downloaded.',
    });
  }

  return (deps.createPresignedDownload ?? createPresignedDownload)({
    objectKey: ownedBlob.objectKey,
  });
}

export async function listUploads(
  input: Pick<ReserveUploadInput, 'userId'>,
  deps: Pick<ServiceDeps, 'repository'> = {
    repository: createUploadRepository(),
  },
): Promise<UploadListItem[]> {
  const uploads = await deps.repository.listOwnedUploads({
    userId: input.userId,
  });

  return uploads.map((upload) => ({
    byteSize: upload.byteSize?.toString() ?? null,
    contentType: upload.contentType,
    createdAt: upload.createdAt,
    filename: upload.filename,
    objectKey: upload.objectKey,
    sourceBlobId: upload.sourceBlobId,
    sourceItemId: upload.sourceItemId,
    status:
      upload.sourceStatus === 'failed'
        ? 'failed'
        : upload.uploadedAt
          ? 'uploaded'
          : 'pending',
    uploadedAt: upload.uploadedAt,
  }));
}
