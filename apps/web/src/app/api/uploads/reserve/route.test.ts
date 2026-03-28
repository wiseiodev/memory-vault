import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getApiSession: vi.fn(),
  reserveUpload: vi.fn(),
}));

vi.mock('@/lib/server/auth/session', () => ({
  getApiSession: mocks.getApiSession,
}));

vi.mock('@/lib/server/uploads/service', () => ({
  reserveUpload: mocks.reserveUpload,
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

describe('POST /api/uploads/reserve', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests', async () => {
    mocks.getApiSession.mockResolvedValueOnce(null);

    const response = await POST(
      new Request('http://localhost/api/uploads/reserve', {
        body: JSON.stringify({
          byteSize: 42,
          contentType: 'application/pdf',
          filename: 'Quarterly Notes.pdf',
        }),
        method: 'POST',
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required.',
    });
  });

  it('returns the reserve payload for authenticated requests', async () => {
    mocks.getApiSession.mockResolvedValueOnce({
      user: {
        id: 'user_123',
      },
    });
    mocks.reserveUpload.mockResolvedValueOnce({
      objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/file.pdf',
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      spaceId: 'spc_123',
      uploadHeaders: {
        'Content-Type': 'application/pdf',
      },
      uploadMethod: 'PUT',
      uploadUrl: 'https://signed.example/upload',
    });

    const response = await POST(
      new Request('http://localhost/api/uploads/reserve', {
        body: JSON.stringify({
          byteSize: 42,
          contentType: 'application/pdf',
          filename: 'file.pdf',
        }),
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.reserveUpload).toHaveBeenCalledWith({
      byteSize: 42,
      contentType: 'application/pdf',
      filename: 'file.pdf',
      spaceId: undefined,
      userId: 'user_123',
    });
    await expect(response.json()).resolves.toEqual({
      objectKey: 'spaces/spc_123/sources/src_123/blobs/blob_123/file.pdf',
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
});
