import 'server-only';

import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { getDb } from '@/db';
import { deviceTokens, spaces } from '@/db/schema';

type Db = ReturnType<typeof getDb>;

export type DeviceTokenActor = {
  deviceTokenId: string;
  label: string | null;
  platform: 'chrome_extension';
  spaceId: string;
  tokenPrefix: string;
  userId: string;
};

export type DeviceTokenRepository = {
  create(input: {
    createdAt: Date;
    deviceTokenId: string;
    hashAlgorithm: 'sha256';
    label: string | null;
    metadata: Record<string, unknown>;
    platform: 'chrome_extension';
    spaceId: string;
    tokenHash: string;
    tokenPrefix: string;
    userId: string;
  }): Promise<void>;
  findActiveActorByTokenHash(input: {
    tokenHash: string;
  }): Promise<DeviceTokenActor | null>;
  listOwned(input: { userId: string }): Promise<
    Array<{
      createdAt: string;
      id: string;
      label: string | null;
      lastUsedAt: string | null;
      platform: 'chrome_extension';
      revokedAt: string | null;
      spaceId: string;
      tokenPrefix: string;
    }>
  >;
  revoke(input: { deviceTokenId: string; revokedAt: Date }): Promise<boolean>;
  revokeOwned(input: {
    deviceTokenId: string;
    revokedAt: Date;
    userId: string;
  }): Promise<boolean>;
  touchLastUsed(input: { deviceTokenId: string; usedAt: Date }): Promise<void>;
};

export function createDeviceTokenRepository(
  db: Db = getDb(),
): DeviceTokenRepository {
  return {
    async create(input) {
      await db.insert(deviceTokens).values({
        createdAt: input.createdAt,
        hashAlgorithm: input.hashAlgorithm,
        id: input.deviceTokenId,
        label: input.label,
        metadata: input.metadata,
        platform: input.platform,
        spaceId: input.spaceId,
        tokenHash: input.tokenHash,
        tokenPrefix: input.tokenPrefix,
        updatedAt: input.createdAt,
        userId: input.userId,
      });
    },
    async findActiveActorByTokenHash(input) {
      const [row] = await db
        .select({
          deviceTokenId: deviceTokens.id,
          label: deviceTokens.label,
          platform: deviceTokens.platform,
          spaceId: deviceTokens.spaceId,
          tokenPrefix: deviceTokens.tokenPrefix,
          userId: deviceTokens.userId,
        })
        .from(deviceTokens)
        .innerJoin(
          spaces,
          and(
            eq(deviceTokens.spaceId, spaces.id),
            eq(deviceTokens.userId, spaces.ownerUserId),
          ),
        )
        .where(
          and(
            eq(deviceTokens.tokenHash, input.tokenHash),
            isNull(deviceTokens.revokedAt),
            isNotNull(deviceTokens.spaceId),
            isNull(spaces.deletedAt),
            isNull(spaces.archivedAt),
          ),
        )
        .limit(1);

      if (!row?.spaceId) {
        return null;
      }

      return {
        ...row,
        platform: 'chrome_extension',
        spaceId: row.spaceId,
      };
    },
    async listOwned(input) {
      const rows = await db
        .select({
          createdAt: deviceTokens.createdAt,
          id: deviceTokens.id,
          label: deviceTokens.label,
          lastUsedAt: deviceTokens.lastUsedAt,
          platform: deviceTokens.platform,
          revokedAt: deviceTokens.revokedAt,
          spaceId: deviceTokens.spaceId,
          tokenPrefix: deviceTokens.tokenPrefix,
        })
        .from(deviceTokens)
        .where(eq(deviceTokens.userId, input.userId))
        .orderBy(desc(deviceTokens.createdAt));

      return rows.flatMap((row) => {
        if (!row.spaceId) {
          return [];
        }

        return [
          {
            createdAt: row.createdAt.toISOString(),
            id: row.id,
            label: row.label,
            lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
            platform: 'chrome_extension' as const,
            revokedAt: row.revokedAt?.toISOString() ?? null,
            spaceId: row.spaceId,
            tokenPrefix: row.tokenPrefix,
          },
        ];
      });
    },
    async revoke(input) {
      const [revoked] = await db
        .update(deviceTokens)
        .set({
          revokedAt: input.revokedAt,
          updatedAt: input.revokedAt,
        })
        .where(
          and(
            eq(deviceTokens.id, input.deviceTokenId),
            isNull(deviceTokens.revokedAt),
          ),
        )
        .returning({
          id: deviceTokens.id,
        });

      return Boolean(revoked);
    },
    async revokeOwned(input) {
      const [revoked] = await db
        .update(deviceTokens)
        .set({
          revokedAt: input.revokedAt,
          updatedAt: input.revokedAt,
        })
        .where(
          and(
            eq(deviceTokens.id, input.deviceTokenId),
            eq(deviceTokens.userId, input.userId),
            isNull(deviceTokens.revokedAt),
          ),
        )
        .returning({
          id: deviceTokens.id,
        });

      return Boolean(revoked);
    },
    async touchLastUsed(input) {
      await db
        .update(deviceTokens)
        .set({
          lastUsedAt: input.usedAt,
          updatedAt: input.usedAt,
        })
        .where(eq(deviceTokens.id, input.deviceTokenId));
    },
  };
}
