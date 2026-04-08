import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/columns/id', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}_123`),
}));

import {
  abandonWebCapture,
  beginWebCapture,
  completeWebCapture,
  createExtensionNoteCapture,
  createNoteCapture,
  createUrlCapture,
  finalizeUploadCapture,
} from './service';

function createRepositoryMocks() {
  return {
    abandonWebCaptureReservation: vi.fn(),
    createCapture: vi.fn(),
    createWebCaptureReservation: vi.fn(),
    finalizeWebCaptureReservation: vi.fn(),
    findExtensionCaptureByExternalId: vi.fn(),
  };
}

function createSpaceRepositoryMocks() {
  return {
    createDefaultForUser: vi.fn(),
    findDefaultForUser: vi.fn(),
    findOwnedById: vi.fn(),
  };
}

describe('createNoteCapture', () => {
  it('creates a canonical note source item with raw content in metadata', async () => {
    const createCapture = vi.fn(async (input) => ({
      capturedAt: '2026-03-29T00:10:00.000Z',
      jobId: input.ingestionJob.id,
      kind: input.kind,
      sourceItemId: input.sourceItemId,
      spaceId: input.spaceId,
      status: 'pending' as const,
    }));
    const dispatchIngestionJob = vi.fn(async () => undefined);

    const result = await createNoteCapture(
      {
        body: 'Remember to renew the passport next month.',
        title: 'Passport reminder',
        userId: 'user_123',
      },
      {
        dispatchIngestionJob,
        now: () => new Date('2026-03-29T00:10:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          createCapture,
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
      },
    );

    expect(createCapture).toHaveBeenCalledWith({
      canonicalUri: null,
      capturedAt: new Date('2026-03-29T00:10:00.000Z'),
      ingestionJob: {
        id: 'job_123',
        maxAttempts: 3,
        payload: {
          sourceKind: 'note',
        },
      },
      kind: 'note',
      metadata: {
        noteBody: 'Remember to renew the passport next month.',
      },
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      title: 'Passport reminder',
      userId: 'user_123',
    });
    expect(dispatchIngestionJob).toHaveBeenCalledWith({
      jobId: 'job_123',
      sourceItemId: 'src_123',
    });
    expect(result).toEqual({
      capturedAt: '2026-03-29T00:10:00.000Z',
      kind: 'note',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      status: 'pending',
    });
  });

  it('creates a default space when the user has none', async () => {
    const createDefaultForUser = vi.fn(async () => ({
      id: 'spc_123',
      name: 'Personal',
    }));

    await createNoteCapture(
      {
        body: 'Quick note',
        userId: 'user_123',
      },
      {
        dispatchIngestionJob: vi.fn(async () => undefined),
        now: () => new Date('2026-03-29T00:10:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          createCapture: vi.fn(async (input) => ({
            capturedAt: '2026-03-29T00:10:00.000Z',
            jobId: input.ingestionJob.id,
            kind: input.kind,
            sourceItemId: input.sourceItemId,
            spaceId: input.spaceId,
            status: 'pending' as const,
          })),
        },
        spaceRepository: {
          ...createSpaceRepositoryMocks(),
          createDefaultForUser,
          findDefaultForUser: vi.fn(async () => null),
          findOwnedById: vi.fn(async () => null),
        },
      },
    );

    expect(createDefaultForUser).toHaveBeenCalledWith({
      userId: 'user_123',
    });
  });
});

describe('createUrlCapture', () => {
  it('creates a canonical web page source item with URL metadata', async () => {
    const createCapture = vi.fn(async (input) => ({
      capturedAt: '2026-03-29T00:12:00.000Z',
      jobId: input.ingestionJob.id,
      kind: input.kind,
      sourceItemId: input.sourceItemId,
      spaceId: input.spaceId,
      status: 'pending' as const,
    }));
    const dispatchIngestionJob = vi.fn(async () => undefined);

    const result = await createUrlCapture(
      {
        title: 'Trip planning doc',
        url: 'https://example.com/trips/japan',
        userId: 'user_123',
      },
      {
        dispatchIngestionJob,
        now: () => new Date('2026-03-29T00:12:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          createCapture,
        },
        spaceRepository: {
          ...createSpaceRepositoryMocks(),
          createDefaultForUser: vi.fn(async () => ({
            id: 'spc_123',
            name: 'Personal',
          })),
          findDefaultForUser: vi.fn(async () => ({
            id: 'spc_123',
            name: 'Personal',
          })),
          findOwnedById: vi.fn(async () => null),
        },
      },
    );

    expect(createCapture).toHaveBeenCalledWith({
      canonicalUri: 'https://example.com/trips/japan',
      capturedAt: new Date('2026-03-29T00:12:00.000Z'),
      ingestionJob: {
        id: 'job_123',
        maxAttempts: 3,
        payload: {
          sourceKind: 'web_page',
        },
      },
      kind: 'web_page',
      metadata: {
        submittedUrl: 'https://example.com/trips/japan',
      },
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      title: 'Trip planning doc',
      userId: 'user_123',
    });
    expect(dispatchIngestionJob).toHaveBeenCalledWith({
      jobId: 'job_123',
      sourceItemId: 'src_123',
    });
    expect(result).toEqual({
      capturedAt: '2026-03-29T00:12:00.000Z',
      kind: 'web_page',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      status: 'pending',
    });
  });
});

describe('finalizeUploadCapture', () => {
  it('delegates file finalization and returns the canonical capture summary', async () => {
    const dispatchIngestionJob = vi.fn(async () => undefined);

    const result = await finalizeUploadCapture(
      {
        sourceBlobId: 'blob_123',
        sourceItemId: 'src_123',
        userId: 'user_123',
      },
      {
        dispatchIngestionJob,
        completeUpload: vi.fn(async () => ({
          bucket: 'memory-vault-bucket',
          byteSize: '64',
          contentType: 'text/plain',
          etag: 'etag-123',
          ingestionJobId: 'job_123',
          objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/note.txt',
          sourceBlobId: 'blob_123',
          sourceItemId: 'src_123',
          spaceId: 'spc_123',
          uploadedAt: '2026-03-29T00:14:00.000Z',
        })),
      },
    );

    expect(dispatchIngestionJob).toHaveBeenCalledWith({
      jobId: 'job_123',
      sourceItemId: 'src_123',
    });
    expect(result).toEqual({
      capturedAt: '2026-03-29T00:14:00.000Z',
      kind: 'file',
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      status: 'pending',
    });
  });

  it('throws when upload finalization does not return an uploadedAt timestamp', async () => {
    await expect(
      finalizeUploadCapture(
        {
          sourceBlobId: 'blob_123',
          sourceItemId: 'src_123',
          userId: 'user_123',
        },
        {
          dispatchIngestionJob: vi.fn(async () => undefined),
          completeUpload: vi.fn(async () => ({
            bucket: 'memory-vault-bucket',
            byteSize: '64',
            contentType: 'text/plain',
            etag: 'etag-123',
            ingestionJobId: 'job_123',
            objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/note.txt',
            sourceBlobId: 'blob_123',
            sourceItemId: 'src_123',
            spaceId: 'spc_123',
            uploadedAt: null,
          })),
        },
      ),
    ).rejects.toThrow('completeUpload did not return an uploadedAt timestamp');
  });
});

describe('createExtensionNoteCapture', () => {
  it('returns an existing extension note capture without creating a duplicate', async () => {
    const result = await createExtensionNoteCapture(
      {
        body: 'Existing note',
        captureRequestId: 'req_123',
        spaceId: 'spc_123',
        userId: 'user_123',
      },
      {
        dispatchIngestionJob: vi.fn(async () => undefined),
        now: () => new Date('2026-03-29T00:20:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          findExtensionCaptureByExternalId: vi.fn(async () => ({
            capturedAt: '2026-03-29T00:19:00.000Z',
            kind: 'note' as const,
            sourceBlobContentType: null,
            sourceBlobId: null,
            sourceBlobObjectKey: null,
            sourceBlobUploadedAt: null,
            sourceItemId: 'src_existing',
            spaceId: 'spc_123',
            status: 'ready' as const,
          })),
        },
      },
    );

    expect(result).toEqual({
      capturedAt: '2026-03-29T00:19:00.000Z',
      kind: 'note',
      sourceItemId: 'src_existing',
      spaceId: 'spc_123',
      status: 'ready',
    });
  });
});

describe('beginWebCapture', () => {
  it('creates a pending reservation and returns a snapshot upload contract', async () => {
    const createWebCaptureReservation = vi.fn(async () => ({
      capturedAt: '2026-03-29T00:30:00.000Z',
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      status: 'pending' as const,
    }));
    const createPresignedUpload = vi.fn(async () => ({
      uploadHeaders: {
        'Content-Type': 'text/html',
      },
      uploadUrl: 'https://bucket.example/upload',
    }));

    const result = await beginWebCapture(
      {
        captureRequestId: 'req_123',
        capturedAt: '2026-03-29T00:30:00.000Z',
        htmlByteSize: 128,
        htmlContentType: 'text/html',
        selectedText: 'Remember this passage.',
        spaceId: 'spc_123',
        title: 'Trip notes',
        url: 'https://example.com/trips/japan',
        userId: 'user_123',
      },
      {
        createPresignedUpload,
        now: () => new Date('2026-03-29T00:30:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          createWebCaptureReservation,
          findExtensionCaptureByExternalId: vi.fn(async () => null),
        },
        storageHeadObject: vi.fn(async () => null),
      },
    );

    expect(createWebCaptureReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalUri: 'https://example.com/trips/japan',
        contentType: 'text/html',
        externalId: 'req_123',
        metadata: expect.objectContaining({
          captureRequestId: 'req_123',
          capturedAt: '2026-03-29T00:30:00.000Z',
          pageTitle: 'Trip notes',
          selectedText: 'Remember this passage.',
          submittedUrl: 'https://example.com/trips/japan',
        }),
        sourceBlobId: 'blob_123',
        sourceItemId: 'src_123',
        title: 'Trip notes',
      }),
    );
    expect(result).toEqual({
      capture: {
        capturedAt: '2026-03-29T00:30:00.000Z',
        kind: 'web_page',
        sourceBlobId: 'blob_123',
        sourceItemId: 'src_123',
        spaceId: 'spc_123',
        status: 'pending',
      },
      phase: 'upload_required',
      upload: {
        objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/page.html',
        sourceBlobId: 'blob_123',
        sourceItemId: 'src_123',
        uploadHeaders: {
          'Content-Type': 'text/html',
        },
        uploadMethod: 'PUT',
        uploadUrl: 'https://bucket.example/upload',
      },
    });
  });

  it('reuses an uploaded pending snapshot without issuing another upload contract', async () => {
    const createPresignedUpload = vi.fn();

    const result = await beginWebCapture(
      {
        captureRequestId: 'req_123',
        capturedAt: '2026-03-29T00:30:00.000Z',
        htmlByteSize: 128,
        htmlContentType: 'text/html',
        spaceId: 'spc_123',
        title: 'Trip notes',
        url: 'https://example.com/trips/japan',
        userId: 'user_123',
      },
      {
        createPresignedUpload,
        now: () => new Date('2026-03-29T00:30:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          findExtensionCaptureByExternalId: vi.fn(async () => ({
            capturedAt: '2026-03-29T00:30:00.000Z',
            kind: 'web_page' as const,
            sourceBlobContentType: 'text/html',
            sourceBlobId: 'blob_123',
            sourceBlobObjectKey:
              'spaces/spc_123/sources/src_123/blobs/blob_123/page.html',
            sourceBlobUploadedAt: '2026-03-29T00:30:10.000Z',
            sourceItemId: 'src_123',
            spaceId: 'spc_123',
            status: 'pending' as const,
          })),
        },
        storageHeadObject: vi.fn(async () => ({
          byteSize: BigInt(128),
          contentType: 'text/html',
          etag: 'etag_123',
        })),
      },
    );

    expect(createPresignedUpload).not.toHaveBeenCalled();
    expect(result).toEqual({
      capture: {
        capturedAt: '2026-03-29T00:30:00.000Z',
        kind: 'web_page',
        sourceBlobId: 'blob_123',
        sourceItemId: 'src_123',
        spaceId: 'spc_123',
        status: 'pending',
      },
      phase: 'ready_to_complete',
      upload: null,
    });
  });
});

describe('completeWebCapture', () => {
  it('finalizes the uploaded snapshot and dispatches the ingestion job', async () => {
    const dispatchIngestionJob = vi.fn(async () => undefined);
    const finalizeWebCaptureReservation = vi.fn(async () => ({
      capturedAt: '2026-03-29T00:40:00.000Z',
      kind: 'web_page' as const,
      sourceBlobContentType: 'text/html',
      sourceBlobId: 'blob_123',
      sourceBlobObjectKey: null,
      sourceBlobUploadedAt: '2026-03-29T00:40:00.000Z',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      status: 'pending' as const,
    }));

    const result = await completeWebCapture(
      {
        captureRequestId: 'req_123',
        sourceBlobId: 'blob_123',
        sourceItemId: 'src_123',
        spaceId: 'spc_123',
        userId: 'user_123',
      },
      {
        dispatchIngestionJob,
        now: () => new Date('2026-03-29T00:40:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          finalizeWebCaptureReservation,
          findExtensionCaptureByExternalId: vi.fn(async () => ({
            capturedAt: '2026-03-29T00:39:00.000Z',
            kind: 'web_page' as const,
            sourceBlobContentType: 'text/html',
            sourceBlobId: 'blob_123',
            sourceBlobObjectKey:
              'spaces/spc_123/sources/src_123/blobs/blob_123/page.html',
            sourceBlobUploadedAt: null,
            sourceItemId: 'src_123',
            spaceId: 'spc_123',
            status: 'pending' as const,
          })),
        },
        storageHeadObject: vi.fn(async () => ({
          byteSize: BigInt(256),
          contentType: 'text/html',
          etag: 'etag_123',
        })),
      },
    );

    expect(finalizeWebCaptureReservation).toHaveBeenCalledWith({
      byteSize: BigInt(256),
      captureRequestId: 'req_123',
      contentType: 'text/html',
      etag: 'etag_123',
      ingestionJob: {
        id: 'job_123',
        maxAttempts: 3,
        payload: {
          captureRequestId: 'req_123',
          snapshotSourceBlobId: 'blob_123',
          sourceKind: 'web_page',
        },
      },
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      uploadedAt: new Date('2026-03-29T00:40:00.000Z'),
      userId: 'user_123',
    });
    expect(dispatchIngestionJob).toHaveBeenCalledWith({
      jobId: 'job_123',
      sourceItemId: 'src_123',
    });
    expect(result).toEqual({
      capturedAt: '2026-03-29T00:40:00.000Z',
      kind: 'web_page',
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      status: 'pending',
    });
  });
});

describe('abandonWebCapture', () => {
  it('does not delete a snapshot blob once the capture is already complete', async () => {
    const deleteObject = vi.fn(async () => undefined);

    const result = await abandonWebCapture(
      {
        captureRequestId: 'req_123',
        sourceBlobId: 'blob_123',
        sourceItemId: 'src_123',
        spaceId: 'spc_123',
        userId: 'user_123',
      },
      {
        deleteObject,
        now: () => new Date('2026-03-29T00:50:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          findExtensionCaptureByExternalId: vi.fn(async () => ({
            capturedAt: '2026-03-29T00:49:00.000Z',
            kind: 'web_page' as const,
            sourceBlobContentType: 'text/html',
            sourceBlobId: 'blob_123',
            sourceBlobObjectKey:
              'spaces/spc_123/sources/src_123/blobs/blob_123/page.html',
            sourceBlobUploadedAt: '2026-03-29T00:49:10.000Z',
            sourceItemId: 'src_123',
            spaceId: 'spc_123',
            status: 'ready' as const,
          })),
        },
      },
    );

    expect(deleteObject).not.toHaveBeenCalled();
    expect(result).toEqual({ abandoned: true });
  });
});
