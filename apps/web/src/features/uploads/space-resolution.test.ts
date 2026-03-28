import { describe, expect, it, vi } from 'vitest';

import { resolveUploadSpace } from './space-resolution';

describe('resolveUploadSpace', () => {
  it('uses the requested space when it belongs to the user', async () => {
    const findOwnedById = vi.fn(async () => ({
      id: 'spc_requested',
      name: 'Requested',
    }));

    const result = await resolveUploadSpace({
      requestedSpaceId: 'spc_requested',
      repository: {
        createDefaultForUser: vi.fn(),
        findDefaultForUser: vi.fn(),
        findOwnedById,
      },
      userId: 'user_123',
    });

    expect(findOwnedById).toHaveBeenCalledWith({
      spaceId: 'spc_requested',
      userId: 'user_123',
    });
    expect(result).toEqual({
      id: 'spc_requested',
      name: 'Requested',
    });
  });

  it('creates a Personal default space when the user does not have one', async () => {
    const createDefaultForUser = vi.fn(async () => ({
      id: 'spc_default',
      name: 'Personal',
    }));

    const result = await resolveUploadSpace({
      repository: {
        createDefaultForUser,
        findDefaultForUser: vi.fn(async () => null),
        findOwnedById: vi.fn(async () => null),
      },
      userId: 'user_123',
    });

    expect(createDefaultForUser).toHaveBeenCalledWith({
      userId: 'user_123',
    });
    expect(result).toEqual({
      id: 'spc_default',
      name: 'Personal',
    });
  });
});
