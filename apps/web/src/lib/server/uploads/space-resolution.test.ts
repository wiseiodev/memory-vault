import { describe, expect, it, vi } from 'vitest';

import { resolveUploadSpace } from './space-resolution';

describe('resolveUploadSpace', () => {
  it('uses the requested space when it belongs to the user', async () => {
    const findOwnedSpaceById = vi.fn(async () => ({
      id: 'spc_requested',
      name: 'Requested',
    }));

    const result = await resolveUploadSpace({
      requestedSpaceId: 'spc_requested',
      repository: {
        createDefaultSpaceForUser: vi.fn(),
        findDefaultSpaceForUser: vi.fn(),
        findOwnedSpaceById,
      },
      userId: 'user_123',
    });

    expect(findOwnedSpaceById).toHaveBeenCalledWith({
      spaceId: 'spc_requested',
      userId: 'user_123',
    });
    expect(result).toEqual({
      id: 'spc_requested',
      name: 'Requested',
    });
  });

  it('creates a Personal default space when the user does not have one', async () => {
    const createDefaultSpaceForUser = vi.fn(async () => ({
      id: 'spc_default',
      name: 'Personal',
    }));

    const result = await resolveUploadSpace({
      repository: {
        createDefaultSpaceForUser,
        findDefaultSpaceForUser: vi.fn(async () => null),
        findOwnedSpaceById: vi.fn(async () => null),
      },
      userId: 'user_123',
    });

    expect(createDefaultSpaceForUser).toHaveBeenCalledWith({
      userId: 'user_123',
    });
    expect(result).toEqual({
      id: 'spc_default',
      name: 'Personal',
    });
  });
});
