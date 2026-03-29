import 'server-only';

import { type EmbeddingModelMiddleware, wrapEmbeddingModel } from 'ai';
import { createClient } from 'redis';
import { getRequestLogger } from '@/lib/evlog';

type AiCacheStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
};

type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];
type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonArray | JsonObject | JsonPrimitive;

const AI_CACHE_KEY_VERSION = 'v1';

type RedisConnection = ReturnType<typeof createClient>;

let redisClientPromise: Promise<RedisConnection> | null = null;

function stableJsonStringify(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    return `{${entries
      .map(([key, nestedValue]) => {
        return `${JSON.stringify(key)}:${stableJsonStringify(nestedValue)}`;
      })
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJsonValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        toJsonValue(nestedValue),
      ]),
    );
  }

  return String(value);
}

function getRedisClient() {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    return null;
  }

  if (!redisClientPromise) {
    redisClientPromise = createClient({
      url: redisUrl,
    })
      .connect()
      .catch((error) => {
        redisClientPromise = null;
        throw error;
      });
  }

  return redisClientPromise;
}

function logCacheWarning(scope: string, error: unknown) {
  getRequestLogger().warn('ai.cache.degraded', {
    reason: error instanceof Error ? error.message : 'unknown',
    scope,
  });
}

export function buildAiCacheKey(input: { namespace: string; params: unknown }) {
  return [
    'memory-vault',
    'ai-cache',
    AI_CACHE_KEY_VERSION,
    input.namespace,
    stableJsonStringify(toJsonValue(input.params)),
  ].join(':');
}

export function createRedisAiCacheStore(): AiCacheStore | null {
  const clientPromise = getRedisClient();

  if (!clientPromise) {
    return null;
  }

  return {
    async get(key) {
      const client = await clientPromise;
      return client.get(key);
    },
    async set(key, value, ttlSeconds) {
      const client = await clientPromise;
      await client.set(key, value, {
        expiration: {
          type: 'EX',
          value: ttlSeconds,
        },
      });
    },
  };
}

export function createEmbeddingCacheMiddleware(input: {
  namespace: string;
  store: AiCacheStore | null;
  ttlSeconds: number;
}): EmbeddingModelMiddleware {
  const inFlight = new Map<
    string,
    Promise<
      Awaited<ReturnType<NonNullable<EmbeddingModelMiddleware['wrapEmbed']>>>
    >
  >();

  return {
    specificationVersion: 'v3',
    wrapEmbed: async ({ doEmbed, params }) => {
      if (!input.store) {
        return doEmbed();
      }

      const cacheKey = buildAiCacheKey({
        namespace: input.namespace,
        params,
      });
      const existing = inFlight.get(cacheKey);

      if (existing) {
        return existing;
      }

      const work = (async () => {
        try {
          const cached = await input.store?.get(cacheKey);

          if (cached) {
            return JSON.parse(cached);
          }
        } catch (error) {
          logCacheWarning(input.namespace, error);
        }

        const result = await doEmbed();

        try {
          await input.store?.set(
            cacheKey,
            JSON.stringify(result),
            input.ttlSeconds,
          );
        } catch (error) {
          logCacheWarning(input.namespace, error);
        }

        return result;
      })().finally(() => {
        inFlight.delete(cacheKey);
      });

      inFlight.set(cacheKey, work);
      return work;
    },
  };
}

export function createCachedEmbeddingModel(input: {
  middleware: EmbeddingModelMiddleware;
  model: Parameters<typeof wrapEmbeddingModel>[0]['model'];
}) {
  return wrapEmbeddingModel({
    model: input.model,
    middleware: input.middleware,
  });
}
