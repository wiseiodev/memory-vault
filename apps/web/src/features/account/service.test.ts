import { describe, expect, it, vi } from 'vitest';

const requestLogger = {
  error: vi.fn(),
  set: vi.fn(),
};

vi.mock('@/lib/evlog', () => ({
  getRequestLogger: vi.fn(() => requestLogger),
  useLogger: vi.fn(() => requestLogger),
}));

vi.mock('@/features/uploads/storage', () => ({
  createPresignedDownload: vi.fn(async () => 'https://signed.example/download'),
  deleteObject: vi.fn(async () => undefined),
}));

import { ORPCError } from '@orpc/server';

import type { AccountExportData } from './repository';
import { deleteAccount, exportAccount } from './service';

function createAccountData(): AccountExportData {
  return {
    blobs: [
      {
        bucket: 'memory-vault',
        byteSize: '123',
        checksumSha256: null,
        contentType: 'application/pdf',
        createdAt: '2026-04-01T00:00:00.000Z',
        deletedAt: null,
        etag: null,
        extractionStatus: 'ready',
        id: 'blob_1',
        metadata: {},
        objectKey: 'spaces/spc_1/sources/src_1/blobs/blob_1/file.pdf',
        sourceItemId: 'src_1',
        storageProvider: 's3',
        uploadedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        bucket: 'memory-vault',
        byteSize: '456',
        checksumSha256: null,
        contentType: 'application/pdf',
        createdAt: '2026-04-02T00:00:00.000Z',
        deletedAt: '2026-04-05T00:00:00.000Z',
        etag: null,
        extractionStatus: 'ready',
        id: 'blob_2',
        metadata: {},
        objectKey: 'spaces/spc_1/sources/src_2/blobs/blob_2/soft-deleted.pdf',
        sourceItemId: 'src_2',
        storageProvider: 's3',
        uploadedAt: '2026-04-02T00:00:00.000Z',
      },
    ],
    citations: [],
    deviceTokens: [],
    memories: [],
    segments: [],
    sourceItems: [],
    spaces: [],
    user: {
      createdAt: '2026-03-01T00:00:00.000Z',
      email: 'daniel@example.com',
      id: 'user_1',
      name: 'Daniel',
    },
  };
}

function createRepositoryMocks() {
  return {
    deleteAccount: vi.fn(),
    loadExportData: vi.fn(),
  };
}

describe('exportAccount', () => {
  it('returns a versioned manifest with signed download urls for live blobs', async () => {
    const loadExportData = vi.fn(async () => createAccountData());
    const createPresignedDownload = vi.fn(
      async () => 'https://signed.example/download',
    );

    const manifest = await exportAccount(
      { userId: 'user_1' },
      {
        createPresignedDownload,
        now: () => new Date('2026-04-12T12:00:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          loadExportData,
        },
      },
    );

    expect(manifest.version).toBe('1');
    expect(manifest.generatedAt).toBe('2026-04-12T12:00:00.000Z');
    expect(manifest.downloadUrlTtlSeconds).toBe(900);
    expect(manifest.user.email).toBe('daniel@example.com');
    expect(createPresignedDownload).toHaveBeenCalledTimes(1);
    expect(createPresignedDownload).toHaveBeenCalledWith({
      objectKey: 'spaces/spc_1/sources/src_1/blobs/blob_1/file.pdf',
    });

    const [liveBlob, deletedBlob] = manifest.blobs;
    expect(liveBlob.downloadUrl).toBe('https://signed.example/download');
    expect(liveBlob.downloadUrlExpiresAt).toBe('2026-04-12T12:15:00.000Z');
    expect(deletedBlob.downloadUrl).toBeNull();
    expect(deletedBlob.downloadUrlExpiresAt).toBeNull();
    expect(manifest.notes.backupRetention).toMatch(/backup/i);
  });

  it('throws NOT_FOUND when the account does not exist', async () => {
    const loadExportData = vi.fn(async () => null);

    await expect(
      exportAccount(
        { userId: 'missing' },
        {
          createPresignedDownload: vi.fn(),
          now: () => new Date(),
          repository: {
            ...createRepositoryMocks(),
            loadExportData,
          },
        },
      ),
    ).rejects.toBeInstanceOf(ORPCError);
  });

  it('falls back to null downloadUrl when presigning fails', async () => {
    const loadExportData = vi.fn(async () => createAccountData());
    const createPresignedDownload = vi.fn(async () => {
      throw new Error('oidc not available');
    });

    const manifest = await exportAccount(
      { userId: 'user_1' },
      {
        createPresignedDownload,
        now: () => new Date('2026-04-12T12:00:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          loadExportData,
        },
      },
    );

    expect(manifest.blobs[0].downloadUrl).toBeNull();
    expect(requestLogger.error).toHaveBeenCalledWith(
      'account.export.presign_failed',
      expect.objectContaining({
        objectKey: 'spaces/spc_1/sources/src_1/blobs/blob_1/file.pdf',
      }),
    );
  });
});

describe('deleteAccount', () => {
  it('calls the repository to hard-delete the account and each blob object from storage', async () => {
    const deleteAccountFn = vi.fn(async () => ({
      deletedObjectKeys: ['key_a', 'key_b'],
    }));
    const deleteObject = vi.fn(async () => undefined);

    const result = await deleteAccount(
      { userId: 'user_1' },
      {
        deleteObject,
        repository: {
          ...createRepositoryMocks(),
          deleteAccount: deleteAccountFn,
        },
      },
    );

    expect(deleteAccountFn).toHaveBeenCalledWith({ userId: 'user_1' });
    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(deleteObject).toHaveBeenNthCalledWith(1, { objectKey: 'key_a' });
    expect(deleteObject).toHaveBeenNthCalledWith(2, { objectKey: 'key_b' });
    expect(result).toEqual({ deleted: true, userId: 'user_1' });
  });

  it('logs and continues when a blob cannot be deleted from storage', async () => {
    const deleteAccountFn = vi.fn(async () => ({
      deletedObjectKeys: ['key_bad'],
    }));
    const deleteObject = vi.fn(async () => {
      throw new Error('s3 denied');
    });

    const result = await deleteAccount(
      { userId: 'user_1' },
      {
        deleteObject,
        repository: {
          ...createRepositoryMocks(),
          deleteAccount: deleteAccountFn,
        },
      },
    );

    expect(requestLogger.error).toHaveBeenCalledWith(
      'account.delete.blob_cleanup_failed',
      expect.objectContaining({ objectKey: 'key_bad' }),
    );
    expect(result.deleted).toBe(true);
  });
});
