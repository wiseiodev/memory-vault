import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { DatabaseError } from 'pg';

import { getDb } from '@/db';
import { generateId } from '@/db/columns/id';
import { spaces } from '@/db/schema';

type Db = ReturnType<typeof getDb>;

export type Space = {
  id: string;
  name: string;
};

export type SpaceRepository = {
  createDefaultForUser(input: { userId: string }): Promise<Space>;
  findDefaultForUser(input: { userId: string }): Promise<Space | null>;
  findOwnedById(input: {
    spaceId: string;
    userId: string;
  }): Promise<Space | null>;
};

export function createSpaceRepository(db: Db = getDb()): SpaceRepository {
  const repository: SpaceRepository = {
    async createDefaultForUser(input) {
      try {
        const [createdSpace] = await db
          .insert(spaces)
          .values({
            id: generateId('spc'),
            isDefault: true,
            name: 'Personal',
            ownerUserId: input.userId,
          })
          .returning({
            id: spaces.id,
            name: spaces.name,
          });

        return createdSpace;
      } catch (error) {
        if (!(error instanceof DatabaseError) || error.code !== '23505') {
          throw error;
        }

        const existingDefaultSpace = await repository.findDefaultForUser(input);
        if (!existingDefaultSpace) {
          throw error;
        }

        return existingDefaultSpace;
      }
    },
    async findDefaultForUser(input) {
      const [space] = await db
        .select({
          id: spaces.id,
          name: spaces.name,
        })
        .from(spaces)
        .where(
          and(
            eq(spaces.ownerUserId, input.userId),
            eq(spaces.isDefault, true),
            isNull(spaces.deletedAt),
            isNull(spaces.archivedAt),
          ),
        )
        .limit(1);

      return space ?? null;
    },
    async findOwnedById(input) {
      const [space] = await db
        .select({
          id: spaces.id,
          name: spaces.name,
        })
        .from(spaces)
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.ownerUserId, input.userId),
            isNull(spaces.deletedAt),
            isNull(spaces.archivedAt),
          ),
        )
        .limit(1);

      return space ?? null;
    },
  };

  return repository;
}
