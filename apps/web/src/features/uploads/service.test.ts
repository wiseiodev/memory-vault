import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/columns/id', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}_123`),
}));

import { ORPCError } from '@orpc/server';
import {
  completeUpload,
  deleteUpload,
  getDownloadUrl,
  listUploads,
  reserveUpload,
} from './service';

function createRepositoryMocks() {
  return {
    abandonReservation: vi.fn(),
    createReservation: vi.fn(),
    deleteOwnedUpload: vi.fn(),
    finalizeOwnedUpload: vi.fn(),
    findOwnedBlobForCompletion: vi.fn(),
    findOwnedBlobForDownload: vi.fn(),
    listOwnedUploads: vi.fn(),
  };
}

function createSpaceRepositoryMocks() {
  return {
    createDefaultForUser: vi.fn(),
    findDefaultForUser: vi.fn(),
    findOwnedById: vi.fn(),
  };
}

describe('reserveUpload', () => {
  it('creates both source rows and returns the presigned upload contract', async () => {
    const createReservation = vi.fn(async () => ({
      id: 'blob_123',
      objectKey:
        'spaces/spc_123/sources/src_123/blobs/blob_123/Quarterly-Notes.pdf',
      sourceItemId: 'src_123',
    }));
    const createPresignedUpload = vi.fn(async () => ({
      uploadHeaders: {
        'Content-Type': 'application/pdf',
      },
      uploadUrl: 'https://signed.example/upload',
    }));

    const result = await reserveUpload(
      {
        byteSize: 42,
        contentType: 'application/pdf',
        filename: 'Quarterly Notes.pdf',
        userId: 'user_123',
      },
      {
        createPresignedUpload,
        now: () => new Date('2026-03-28T21:00:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          createReservation,
        },
        spaceRepository: {
          ...createSpaceRepositoryMocks(),
          createDefaultForUser: vi.fn(async () => ({
            id: 'spc_123',
            name: 'Personal',
          })),
          findDefaultForUser: vi.fn(async () => null),
          findOwnedById: vi.fn(async () => null),
        },
        storageConfig: {
          bucket: 'memory-vault-bucket',
        },
      },
    );

    expect(createReservation).toHaveBeenCalledWith({
      blobId: 'blob_123',
      bucket: 'memory-vault-bucket',
      byteSize: 42n,
      contentType: 'application/pdf',
      filename: 'Quarterly Notes.pdf',
      objectKey:
        'spaces/spc_123/sources/src_123/blobs/blob_123/Quarterly-Notes.pdf',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      userId: 'user_123',
    });
    expect(result).toEqual({
      objectKey:
        'spaces/spc_123/sources/src_123/blobs/blob_123/Quarterly-Notes.pdf',
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      uploadHeaders: {
        'Content-Type': 'application/pdf',
      },
      uploadMethod: 'PUT',
      uploadUrl: 'https://signed.example/upload',
    });
  });

  it('abandons the reserved rows when presigning fails', async () => {
    const abandonReservation = vi.fn(async () => undefined);

    await expect(
      reserveUpload(
        {
          byteSize: 42,
          contentType: 'application/pdf',
          filename: 'Quarterly Notes.pdf',
          userId: 'user_123',
        },
        {
          createPresignedUpload: vi.fn(async () => {
            throw new Error('missing credentials');
          }),
          now: () => new Date('2026-03-28T21:00:00.000Z'),
          repository: {
            ...createRepositoryMocks(),
            abandonReservation,
            createReservation: vi.fn(async () => ({
              id: 'blob_123',
              objectKey:
                'spaces/spc_123/sources/src_123/blobs/blob_123/Quarterly-Notes.pdf',
              sourceItemId: 'src_123',
            })),
          },
          spaceRepository: {
            ...createSpaceRepositoryMocks(),
            createDefaultForUser: vi.fn(async () => ({
              id: 'spc_123',
              name: 'Personal',
            })),
            findDefaultForUser: vi.fn(async () => null),
            findOwnedById: vi.fn(async () => null),
          },
          storageConfig: {
            bucket: 'memory-vault-bucket',
          },
        },
      ),
    ).rejects.toThrow('missing credentials');

    expect(abandonReservation).toHaveBeenCalledWith({
      abandonedAt: new Date('2026-03-28T21:00:00.000Z'),
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
    });
  });
});

describe('completeUpload', () => {
  it('rejects completion for blobs outside the user spaces', async () => {
    await expect(
      completeUpload(
        {
          sourceBlobId: 'blob_123',
          sourceItemId: 'src_123',
          userId: 'user_123',
        },
        {
          now: () => new Date('2026-03-28T21:00:00.000Z'),
          repository: {
            ...createRepositoryMocks(),
            findOwnedBlobForCompletion: vi.fn(async () => null),
          },
          storage: {
            headObject: vi.fn(),
          },
        },
      ),
    ).rejects.toThrow(
      new ORPCError('NOT_FOUND', {
        message: 'Upload not found for this user.',
      }),
    );
  });

  it('updates blob metadata after a successful object HEAD', async () => {
    const finalizeOwnedUpload = vi.fn(async () => ({
      bucket: 'memory-vault-bucket',
      byteSize: 64n,
      contentType: 'text/plain',
      etag: 'etag-123',
      objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/note.txt',
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      uploadedAt: '2026-03-28T21:00:00.000Z',
    }));
    const result = await completeUpload(
      {
        sourceBlobId: 'blob_123',
        sourceItemId: 'src_123',
        userId: 'user_123',
      },
      {
        now: () => new Date('2026-03-28T21:00:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          finalizeOwnedUpload,
          findOwnedBlobForCompletion: vi.fn(async () => ({
            bucket: 'memory-vault-bucket',
            objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/note.txt',
            sourceBlobId: 'blob_123',
            sourceItemId: 'src_123',
            spaceId: 'spc_123',
          })),
        },
        storage: {
          headObject: vi.fn(async () => ({
            byteSize: 64n,
            contentType: 'text/plain',
            etag: 'etag-123',
          })),
        },
      },
    );

    expect(finalizeOwnedUpload).toHaveBeenCalledWith({
      byteSize: 64n,
      contentType: 'text/plain',
      etag: 'etag-123',
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      uploadedAt: new Date('2026-03-28T21:00:00.000Z'),
      userId: 'user_123',
    });
    expect(result).toEqual({
      bucket: 'memory-vault-bucket',
      byteSize: '64',
      contentType: 'text/plain',
      etag: 'etag-123',
      objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/note.txt',
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      uploadedAt: '2026-03-28T21:00:00.000Z',
    });
  });

  it('treats replayed completion as an idempotent success', async () => {
    const result = await completeUpload(
      {
        sourceBlobId: 'blob_123',
        sourceItemId: 'src_123',
        userId: 'user_123',
      },
      {
        now: () => new Date('2026-03-28T21:00:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          finalizeOwnedUpload: vi.fn(async () => ({
            bucket: 'memory-vault-bucket',
            byteSize: 64n,
            contentType: 'text/plain',
            etag: 'etag-123',
            objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/note.txt',
            sourceBlobId: 'blob_123',
            sourceItemId: 'src_123',
            spaceId: 'spc_123',
            uploadedAt: '2026-03-28T20:59:00.000Z',
          })),
          findOwnedBlobForCompletion: vi.fn(async () => ({
            bucket: 'memory-vault-bucket',
            objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/note.txt',
            sourceBlobId: 'blob_123',
            sourceItemId: 'src_123',
            spaceId: 'spc_123',
          })),
        },
        storage: {
          headObject: vi.fn(async () => ({
            byteSize: 65n,
            contentType: 'text/plain',
            etag: 'etag-new',
          })),
        },
      },
    );

    expect(result.uploadedAt).toBe('2026-03-28T20:59:00.000Z');
    expect(result.etag).toBe('etag-123');
    expect(result.byteSize).toBe('64');
  });
});

describe('getDownloadUrl', () => {
  it('rejects pending uploads', async () => {
    await expect(
      getDownloadUrl(
        {
          sourceBlobId: 'blob_123',
          userId: 'user_123',
        },
        {
          createPresignedDownload: vi.fn(),
          repository: {
            ...createRepositoryMocks(),
            findOwnedBlobForDownload: vi.fn(async () => ({
              objectKey:
                'spaces/spc_123/sources/src_123/blobs/blob_123/note.txt',
              uploadedAt: null,
            })),
          },
        },
      ),
    ).rejects.toThrow(
      new ORPCError('CONFLICT', {
        message: 'Only uploaded files can be downloaded.',
      }),
    );
  });
});

describe('deleteUpload', () => {
  it('deletes the object and soft deletes the rows', async () => {
    const deleteObject = vi.fn(async () => undefined);
    const deleteOwnedUpload = vi.fn(async () => true);

    const result = await deleteUpload(
      {
        sourceBlobId: 'blob_123',
        sourceItemId: 'src_123',
        userId: 'user_123',
      },
      {
        deleteObject,
        now: () => new Date('2026-03-28T21:00:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          deleteOwnedUpload,
          findOwnedBlobForCompletion: vi.fn(async () => ({
            bucket: 'memory-vault-bucket',
            objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/note.txt',
            sourceBlobId: 'blob_123',
            sourceItemId: 'src_123',
            spaceId: 'spc_123',
          })),
        },
      },
    );

    expect(deleteObject).toHaveBeenCalledWith({
      objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/note.txt',
    });
    expect(deleteOwnedUpload).toHaveBeenCalledWith({
      deletedAt: new Date('2026-03-28T21:00:00.000Z'),
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      userId: 'user_123',
    });
    expect(result).toEqual({
      deleted: true,
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
    });
  });
});

describe('listUploads', () => {
  it('maps source rows into uploaded, pending, and failed UI states', async () => {
    const uploads = await listUploads(
      {
        userId: 'user_123',
      },
      {
        repository: {
          ...createRepositoryMocks(),
          listOwnedUploads: vi.fn(async () => [
            {
              byteSize: 64n,
              contentType: 'text/plain',
              createdAt: '2026-03-28T21:00:00.000Z',
              filename: 'done.txt',
              objectKey: 'uploaded-key',
              sourceBlobId: 'blob_uploaded',
              sourceItemId: 'src_uploaded',
              sourceStatus: 'pending' as const,
              uploadedAt: '2026-03-28T21:05:00.000Z',
            },
            {
              byteSize: null,
              contentType: 'text/plain',
              createdAt: '2026-03-28T21:01:00.000Z',
              filename: 'waiting.txt',
              objectKey: 'pending-key',
              sourceBlobId: 'blob_pending',
              sourceItemId: 'src_pending',
              sourceStatus: 'pending' as const,
              uploadedAt: null,
            },
            {
              byteSize: null,
              contentType: null,
              createdAt: '2026-03-28T21:02:00.000Z',
              filename: 'broken.txt',
              objectKey: 'failed-key',
              sourceBlobId: 'blob_failed',
              sourceItemId: 'src_failed',
              sourceStatus: 'failed' as const,
              uploadedAt: null,
            },
          ]),
        },
      },
    );

    expect(uploads).toEqual([
      {
        byteSize: '64',
        contentType: 'text/plain',
        createdAt: '2026-03-28T21:00:00.000Z',
        filename: 'done.txt',
        objectKey: 'uploaded-key',
        sourceBlobId: 'blob_uploaded',
        sourceItemId: 'src_uploaded',
        status: 'uploaded',
        uploadedAt: '2026-03-28T21:05:00.000Z',
      },
      {
        byteSize: null,
        contentType: 'text/plain',
        createdAt: '2026-03-28T21:01:00.000Z',
        filename: 'waiting.txt',
        objectKey: 'pending-key',
        sourceBlobId: 'blob_pending',
        sourceItemId: 'src_pending',
        status: 'pending',
        uploadedAt: null,
      },
      {
        byteSize: null,
        contentType: null,
        createdAt: '2026-03-28T21:02:00.000Z',
        filename: 'broken.txt',
        objectKey: 'failed-key',
        sourceBlobId: 'blob_failed',
        sourceItemId: 'src_failed',
        status: 'failed',
        uploadedAt: null,
      },
    ]);
  });
});
