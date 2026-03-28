import type { SpaceRepository } from '@/features/spaces';

export type UploadSpaceRepository = Pick<
  SpaceRepository,
  'createDefaultForUser' | 'findDefaultForUser' | 'findOwnedById'
>;

export async function resolveUploadSpace(input: {
  requestedSpaceId?: string;
  repository: UploadSpaceRepository;
  userId: string;
}) {
  if (input.requestedSpaceId) {
    const ownedSpace = await input.repository.findOwnedById({
      spaceId: input.requestedSpaceId,
      userId: input.userId,
    });

    if (ownedSpace) {
      return ownedSpace;
    }
  }

  const existingDefaultSpace = await input.repository.findDefaultForUser({
    userId: input.userId,
  });

  if (existingDefaultSpace) {
    return existingDefaultSpace;
  }

  return input.repository.createDefaultForUser({
    userId: input.userId,
  });
}
