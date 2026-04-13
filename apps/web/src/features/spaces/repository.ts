import 'server-only';

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { DatabaseError } from 'pg';

import { getDb } from '@/db';
import { generateId } from '@/db/columns/id';
import { memories, sourceItems, spaces } from '@/db/schema';

type Db = ReturnType<typeof getDb>;

export type Space = {
  id: string;
  name: string;
};

export type OwnedSpaceWithCounts = {
  createdAt: string;
  description: string | null;
  id: string;
  isDefault: boolean;
  itemCount: number;
  memoryCount: number;
  name: string;
};

export type SpaceRepository = {
  createDefaultForUser(input: { userId: string }): Promise<Space>;
  findDefaultForUser(input: { userId: string }): Promise<Space | null>;
  findOwnedById(input: {
    spaceId: string;
    userId: string;
  }): Promise<Space | null>;
  findOwnedByIdWithCounts(input: {
    spaceId: string;
    userId: string;
  }): Promise<OwnedSpaceWithCounts | null>;
  listOwnedWithCounts(input: {
    userId: string;
  }): Promise<OwnedSpaceWithCounts[]>;
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
    async findOwnedByIdWithCounts(input) {
      const itemCountExpr = sql<number>`(
        select count(*)::int from ${sourceItems}
        where ${sourceItems.spaceId} = ${spaces.id}
          and ${sourceItems.deletedAt} is null
      )`;

      const memoryCountExpr = sql<number>`(
        select count(*)::int from ${memories}
        where ${memories.spaceId} = ${spaces.id}
          and ${memories.deletedAt} is null
      )`;

      const [space] = await db
        .select({
          createdAt: spaces.createdAt,
          description: spaces.description,
          id: spaces.id,
          isDefault: spaces.isDefault,
          itemCount: itemCountExpr,
          memoryCount: memoryCountExpr,
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

      if (!space) {
        return null;
      }

      return {
        createdAt: space.createdAt.toISOString(),
        description: space.description,
        id: space.id,
        isDefault: space.isDefault,
        itemCount: Number(space.itemCount ?? 0),
        memoryCount: Number(space.memoryCount ?? 0),
        name: space.name,
      };
    },
    async listOwnedWithCounts(input) {
      const itemCountExpr = sql<number>`(
        select count(*)::int from ${sourceItems}
        where ${sourceItems.spaceId} = ${spaces.id}
          and ${sourceItems.deletedAt} is null
      )`;

      const memoryCountExpr = sql<number>`(
        select count(*)::int from ${memories}
        where ${memories.spaceId} = ${spaces.id}
          and ${memories.deletedAt} is null
      )`;

      const rows = await db
        .select({
          createdAt: spaces.createdAt,
          description: spaces.description,
          id: spaces.id,
          isDefault: spaces.isDefault,
          itemCount: itemCountExpr,
          memoryCount: memoryCountExpr,
          name: spaces.name,
        })
        .from(spaces)
        .where(
          and(
            eq(spaces.ownerUserId, input.userId),
            isNull(spaces.deletedAt),
            isNull(spaces.archivedAt),
          ),
        )
        .orderBy(desc(spaces.isDefault), asc(spaces.createdAt));

      return rows.map((row) => ({
        createdAt: row.createdAt.toISOString(),
        description: row.description,
        id: row.id,
        isDefault: row.isDefault,
        itemCount: Number(row.itemCount ?? 0),
        memoryCount: Number(row.memoryCount ?? 0),
        name: row.name,
      }));
    },
  };

  return repository;
}
