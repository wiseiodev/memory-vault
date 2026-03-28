import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getApiSession: vi.fn(),
  getDownloadUrl: vi.fn(),
}));

vi.mock('@/lib/server/auth/session', () => ({
  getApiSession: mocks.getApiSession,
}));

vi.mock('@/lib/server/uploads/service', () => ({
  getDownloadUrl: mocks.getDownloadUrl,
  UploadFlowError: class UploadFlowError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
    ) {
      super(message);
    }
  },
}));

import { GET } from './route';

describe('GET /api/uploads/download', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests', async () => {
    mocks.getApiSession.mockResolvedValueOnce(null);

    const response = await GET(
      new Request(
        'http://localhost/api/uploads/download?sourceBlobId=blob_123',
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required.',
    });
  });

  it('redirects authenticated requests to the presigned download URL', async () => {
    mocks.getApiSession.mockResolvedValueOnce({
      user: {
        id: 'user_123',
      },
    });
    mocks.getDownloadUrl.mockResolvedValueOnce(
      'https://signed.example/download',
    );

    const response = await GET(
      new Request(
        'http://localhost/api/uploads/download?sourceBlobId=blob_123',
      ),
    );

    expect(response.status).toBe(307);
    expect(mocks.getDownloadUrl).toHaveBeenCalledWith({
      sourceBlobId: 'blob_123',
      userId: 'user_123',
    });
    expect(response.headers.get('location')).toBe(
      'https://signed.example/download',
    );
  });
});
