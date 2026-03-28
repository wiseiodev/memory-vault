import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completeUpload: vi.fn(),
  getApiSession: vi.fn(),
}));

vi.mock('@/lib/server/auth/session', () => ({
  getApiSession: mocks.getApiSession,
}));

vi.mock('@/lib/server/uploads/service', () => ({
  completeUpload: mocks.completeUpload,
  UploadFlowError: class UploadFlowError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
    }
  },
}));

import { POST } from './route';

describe('POST /api/uploads/complete', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests', async () => {
    mocks.getApiSession.mockResolvedValueOnce(null);

    const response = await POST(
      new Request('http://localhost/api/uploads/complete', {
        body: JSON.stringify({
          sourceBlobId: 'blob_123',
          sourceItemId: 'src_123',
        }),
        method: 'POST',
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required.',
    });
  });

  it('returns the completion payload for authenticated requests', async () => {
    mocks.getApiSession.mockResolvedValueOnce({
      user: {
        id: 'user_123',
      },
    });
    mocks.completeUpload.mockResolvedValueOnce({
      bucket: 'memory-vault-bucket',
      byteSize: '64',
      contentType: 'text/plain',
      etag: 'etag-123',
      objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/file.txt',
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      uploadedAt: '2026-03-28T21:00:00.000Z',
    });

    const response = await POST(
      new Request('http://localhost/api/uploads/complete', {
        body: JSON.stringify({
          sourceBlobId: 'blob_123',
          sourceItemId: 'src_123',
        }),
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.completeUpload).toHaveBeenCalledWith({
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      userId: 'user_123',
    });
    await expect(response.json()).resolves.toEqual({
      bucket: 'memory-vault-bucket',
      byteSize: '64',
      contentType: 'text/plain',
      etag: 'etag-123',
      objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/file.txt',
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      uploadedAt: '2026-03-28T21:00:00.000Z',
    });
  });
});
