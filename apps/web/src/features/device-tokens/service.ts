import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { ORPCError } from '@orpc/server';

import { generateId } from '@/db/columns/id';
import { createSpaceRepository } from '@/features/spaces';
import {
  createDeviceTokenRepository,
  type DeviceTokenActor,
} from './repository';
import type { DeviceTokenListItem } from './schemas';

type SpaceRepository = Pick<
  ReturnType<typeof createSpaceRepository>,
  'createDefaultForUser' | 'findDefaultForUser'
>;

type IssueDeviceTokenInput = {
  browserVersion?: string;
  deviceLabel?: string;
  extensionId: string;
  extensionVersion?: string;
  userId: string;
};

type AuthenticateDeps = {
  now: () => Date;
  repository: ReturnType<typeof createDeviceTokenRepository>;
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function parseBearerToken(headers: Headers) {
  const authorization = headers.get('authorization');

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/u);

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

async function resolveDefaultSpace(
  userId: string,
  repository: SpaceRepository,
) {
  const existingDefaultSpace = await repository.findDefaultForUser({ userId });

  if (existingDefaultSpace) {
    return existingDefaultSpace;
  }

  return repository.createDefaultForUser({ userId });
}

export async function issueDeviceToken(
  input: IssueDeviceTokenInput,
  deps: {
    now: () => Date;
    randomBytes: typeof randomBytes;
    repository: ReturnType<typeof createDeviceTokenRepository>;
    spaceRepository: SpaceRepository;
  } = {
    now: () => new Date(),
    randomBytes,
    repository: createDeviceTokenRepository(),
    spaceRepository: createSpaceRepository(),
  },
) {
  const issuedAt = deps.now();
  const space = await resolveDefaultSpace(input.userId, deps.spaceRepository);
  const rawToken = `mvt_${deps.randomBytes(32).toString('base64url')}`;
  const deviceTokenId = generateId('dtok');

  await deps.repository.create({
    createdAt: issuedAt,
    deviceTokenId,
    hashAlgorithm: 'sha256',
    label: input.deviceLabel ?? 'Chrome extension',
    metadata: {
      browserVersion: input.browserVersion,
      extensionId: input.extensionId,
      extensionVersion: input.extensionVersion,
      issuedAt: issuedAt.toISOString(),
    },
    platform: 'chrome_extension',
    spaceId: space.id,
    tokenHash: hashToken(rawToken),
    tokenPrefix: rawToken.slice(0, 16),
    userId: input.userId,
  });

  return {
    deviceTokenId,
    rawToken,
    spaceId: space.id,
  };
}

export async function authenticateDeviceToken(
  headers: Headers,
  deps: AuthenticateDeps = {
    now: () => new Date(),
    repository: createDeviceTokenRepository(),
  },
): Promise<DeviceTokenActor | null> {
  const token = parseBearerToken(headers);

  if (!token) {
    return null;
  }

  const actor = await deps.repository.findActiveActorByTokenHash({
    tokenHash: hashToken(token),
  });

  if (!actor) {
    return null;
  }

  await deps.repository.touchLastUsed({
    deviceTokenId: actor.deviceTokenId,
    usedAt: deps.now(),
  });

  return actor;
}

export async function listDeviceTokens(
  input: { userId: string },
  deps: { repository: ReturnType<typeof createDeviceTokenRepository> } = {
    repository: createDeviceTokenRepository(),
  },
): Promise<DeviceTokenListItem[]> {
  return deps.repository.listOwned(input);
}

export async function revokeCurrentDeviceToken(
  input: { deviceTokenId: string },
  deps: {
    now: () => Date;
    repository: ReturnType<typeof createDeviceTokenRepository>;
  } = {
    now: () => new Date(),
    repository: createDeviceTokenRepository(),
  },
) {
  const revoked = await deps.repository.revoke({
    deviceTokenId: input.deviceTokenId,
    revokedAt: deps.now(),
  });

  if (!revoked) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Device token was not found or is already revoked.',
    });
  }

  return { revoked: true as const };
}

export async function revokeOwnedDeviceToken(
  input: { deviceTokenId: string; userId: string },
  deps: {
    now: () => Date;
    repository: ReturnType<typeof createDeviceTokenRepository>;
  } = {
    now: () => new Date(),
    repository: createDeviceTokenRepository(),
  },
) {
  const revoked = await deps.repository.revokeOwned({
    deviceTokenId: input.deviceTokenId,
    revokedAt: deps.now(),
    userId: input.userId,
  });

  if (!revoked) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Device token was not found for this user.',
    });
  }

  return { revoked: true as const };
}
