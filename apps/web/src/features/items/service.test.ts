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
  deleteObject: vi.fn(async () => undefined),
}));

import { ORPCError } from '@orpc/server';

import { deleteItem } from './service';

function createRepositoryMocks() {
  return {
    deleteOwnedItem: vi.fn(),
    getOwnedItem: vi.fn(),
    listOwnedItems: vi.fn(),
  };
}

describe('deleteItem', () => {
  it('soft-deletes the source item and deletes each blob object from storage', async () => {
    const deleteOwnedItem = vi.fn(async () => ({
      deletedObjectKeys: ['spaces/spc_1/sources/src_1/blobs/blob_1/file.pdf'],
    }));
    const deleteObject = vi.fn(async () => undefined);

    const result = await deleteItem(
      { sourceItemId: 'src_1', userId: 'user_1' },
      {
        deleteObject,
        now: () => new Date('2026-04-12T00:00:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          deleteOwnedItem,
        },
      },
    );

    expect(deleteOwnedItem).toHaveBeenCalledWith({
      deletedAt: new Date('2026-04-12T00:00:00.000Z'),
      sourceItemId: 'src_1',
      userId: 'user_1',
    });
    expect(deleteObject).toHaveBeenCalledWith({
      objectKey: 'spaces/spc_1/sources/src_1/blobs/blob_1/file.pdf',
    });
    expect(result).toEqual({
      deleted: true,
      sourceItemId: 'src_1',
    });
  });

  it('logs and continues when a blob cannot be deleted from storage', async () => {
    const deleteOwnedItem = vi.fn(async () => ({
      deletedObjectKeys: ['key_a', 'key_b'],
    }));
    const deleteObject = vi.fn(async (input: { objectKey: string }) => {
      if (input.objectKey === 'key_a') {
        throw new Error('boom');
      }
    });

    const result = await deleteItem(
      { sourceItemId: 'src_1', userId: 'user_1' },
      {
        deleteObject,
        now: () => new Date('2026-04-12T00:00:00.000Z'),
        repository: {
          ...createRepositoryMocks(),
          deleteOwnedItem,
        },
      },
    );

    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(requestLogger.error).toHaveBeenCalledWith(
      'source_item.delete.blob_cleanup_failed',
      expect.objectContaining({ objectKey: 'key_a' }),
    );
    expect(result.deleted).toBe(true);
  });

  it('throws NOT_FOUND when the repository returns null', async () => {
    const deleteOwnedItem = vi.fn(async () => null);

    await expect(
      deleteItem(
        { sourceItemId: 'src_missing', userId: 'user_1' },
        {
          deleteObject: vi.fn(),
          now: () => new Date(),
          repository: {
            ...createRepositoryMocks(),
            deleteOwnedItem,
          },
        },
      ),
    ).rejects.toBeInstanceOf(ORPCError);
  });
});
