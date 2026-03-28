export type UploadSpace = {
  id: string;
  name: string;
};

export type UploadSpaceRepository = {
  createDefaultSpaceForUser(input: { userId: string }): Promise<UploadSpace>;
  findDefaultSpaceForUser(input: {
    userId: string;
  }): Promise<UploadSpace | null>;
  findOwnedSpaceById(input: {
    spaceId: string;
    userId: string;
  }): Promise<UploadSpace | null>;
};

export async function resolveUploadSpace(input: {
  requestedSpaceId?: string;
  repository: UploadSpaceRepository;
  userId: string;
}) {
  if (input.requestedSpaceId) {
    const ownedSpace = await input.repository.findOwnedSpaceById({
      spaceId: input.requestedSpaceId,
      userId: input.userId,
    });

    if (ownedSpace) {
      return ownedSpace;
    }
  }

  const existingDefaultSpace = await input.repository.findDefaultSpaceForUser({
    userId: input.userId,
  });

  if (existingDefaultSpace) {
    return existingDefaultSpace;
  }

  return input.repository.createDefaultSpaceForUser({
    userId: input.userId,
  });
}
