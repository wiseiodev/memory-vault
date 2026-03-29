import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/columns/id', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}_123`),
}));

import {
  createNoteCapture,
  createUrlCapture,
  finalizeUploadCapture,
} from './service';

function createRepositoryMocks() {
  return {
    createCapture: vi.fn(),
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
