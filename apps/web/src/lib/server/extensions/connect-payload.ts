import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { extensionConnectStartParams } from '@memory-vault/extension-contract';
import { z } from 'zod';

const CONNECT_PAYLOAD_TTL_MS = 10 * 60 * 1000;
const CONNECT_PAYLOAD_VERSION = 1;

type SignedConnectPayload = {
  browserVersion?: string;
  callbackPath: string;
  deviceLabel?: string;
  extensionId: string;
  extensionVersion?: string;
  issuedAt: number;
  state: string;
  version: number;
};

const signedConnectPayloadSchema = extensionConnectStartParams.extend({
  issuedAt: z.number().int(),
  version: z.literal(CONNECT_PAYLOAD_VERSION),
});

function getSigningSecret() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();

  if (!secret) {
    throw new Error(
      'Missing BETTER_AUTH_SECRET. Extension connect payload signing depends on the Better Auth secret.',
    );
  }

  return secret;
}

function sign(payload: string) {
  return createHmac('sha256', getSigningSecret())
    .update(payload)
    .digest('base64url');
}

export function createSignedConnectPayload(
  input: Omit<SignedConnectPayload, 'issuedAt' | 'version'>,
) {
  const payload: SignedConnectPayload = {
    ...input,
    issuedAt: Date.now(),
    version: CONNECT_PAYLOAD_VERSION,
  };
  const serialized = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(serialized);

  return `${serialized}.${signature}`;
}

export function verifySignedConnectPayload(
  value: string | null | undefined,
): SignedConnectPayload | null {
  if (!value) {
    return null;
  }

  const [serialized, signature] = value.split('.');

  if (!serialized || !signature) {
    return null;
  }

  const expectedSignature = sign(serialized);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(serialized, 'base64url').toString('utf8'),
    );
    const validated = signedConnectPayloadSchema.safeParse(parsed);

    if (!validated.success) {
      return null;
    }

    if (Date.now() - validated.data.issuedAt > CONNECT_PAYLOAD_TTL_MS) {
      return null;
    }

    return validated.data;
  } catch {
    return null;
  }
}
