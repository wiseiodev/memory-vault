import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteUpload: vi.fn(),
  getApiSession: vi.fn(),
}));

vi.mock('@/lib/server/auth/session', () => ({
  getApiSession: mocks.getApiSession,
}));

vi.mock('@/lib/server/uploads/service', () => ({
  deleteUpload: mocks.deleteUpload,
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

describe('POST /api/uploads/delete', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests', async () => {
    mocks.getApiSession.mockResolvedValueOnce(null);

    const response = await POST(
      new Request('http://localhost/api/uploads/delete', {
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

  it('returns the delete payload for authenticated requests', async () => {
    mocks.getApiSession.mockResolvedValueOnce({
      user: {
        id: 'user_123',
      },
    });
    mocks.deleteUpload.mockResolvedValueOnce({
      deleted: true,
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
    });

    const response = await POST(
      new Request('http://localhost/api/uploads/delete', {
        body: JSON.stringify({
          sourceBlobId: 'blob_123',
          sourceItemId: 'src_123',
        }),
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.deleteUpload).toHaveBeenCalledWith({
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
      userId: 'user_123',
    });
    await expect(response.json()).resolves.toEqual({
      deleted: true,
      sourceBlobId: 'blob_123',
      sourceItemId: 'src_123',
    });
  });
});
