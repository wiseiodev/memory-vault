import 'server-only';

import { ORPCError } from '@orpc/server';

import { createSpaceRepository, type SpaceRepository } from './repository';
import type { SpaceDetail, SpaceListItem } from './schemas';

type Deps = {
  repository: SpaceRepository;
};

export async function listSpaces(
  input: { userId: string },
  deps: Deps = { repository: createSpaceRepository() },
): Promise<SpaceListItem[]> {
  const rows = await deps.repository.listOwnedWithCounts({
    userId: input.userId,
  });

  return rows.map((row) => ({
    description: row.description,
    id: row.id,
    isDefault: row.isDefault,
    itemCount: row.itemCount,
    memoryCount: row.memoryCount,
    name: row.name,
  }));
}

export async function getSpace(
  input: { spaceId: string; userId: string },
  deps: Deps = { repository: createSpaceRepository() },
): Promise<SpaceDetail> {
  const row = await deps.repository.findOwnedByIdWithCounts(input);

  if (!row) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Space was not found.',
    });
  }

  return {
    createdAt: row.createdAt,
    description: row.description,
    id: row.id,
    isDefault: row.isDefault,
    itemCount: row.itemCount,
    memoryCount: row.memoryCount,
    name: row.name,
  };
}
