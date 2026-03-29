import { describe, expect, it, vi } from 'vitest';

const requestLogger = {
  warn: vi.fn(),
};

vi.mock('@/lib/evlog', () => ({
  getRequestLogger: vi.fn(() => requestLogger),
}));

import { buildAiCacheKey, createEmbeddingCacheMiddleware } from './cache';

type TestEmbeddingResult = {
  embeddings: number[][];
  warnings: [];
};

function createEmbeddingResult(embeddings: number[][]): TestEmbeddingResult {
  return {
    embeddings,
    warnings: [],
  };
}

describe('buildAiCacheKey', () => {
  it('is stable for equivalent inputs with different object key order', () => {
    const left = buildAiCacheKey({
      namespace: 'query-embedding',
      params: {
        model: 'gemini',
        options: { taskType: 'RETRIEVAL_QUERY', z: 1, a: 2 },
        value: 'hello',
      },
    });
    const right = buildAiCacheKey({
      namespace: 'query-embedding',
      params: {
        model: 'gemini',
        options: { a: 2, taskType: 'RETRIEVAL_QUERY', z: 1 },
        value: 'hello',
      },
    });

    expect(left).toBe(right);
  });
});

describe('createEmbeddingCacheMiddleware', () => {
  it('reuses a cached result on repeated identical calls', async () => {
    const cachedValue = JSON.stringify(createEmbeddingResult([[1, 2, 3]]));
    const store = {
      get: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(cachedValue),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const middleware = createEmbeddingCacheMiddleware({
      namespace: 'query-embedding',
      store,
      ttlSeconds: 60,
    });
    const doEmbed = vi.fn(async () => createEmbeddingResult([[1, 2, 3]]));
    const params = {
      providerOptions: { google: { taskType: 'RETRIEVAL_QUERY' } },
      values: ['hello'],
    };

    const first = await middleware.wrapEmbed?.({
      doEmbed: doEmbed as never,
      model: {} as never,
      params: params as never,
    });
    const second = await middleware.wrapEmbed?.({
      doEmbed: doEmbed as never,
      model: {} as never,
      params: params as never,
    });

    expect(first).toEqual(createEmbeddingResult([[1, 2, 3]]));
    expect(second).toEqual(createEmbeddingResult([[1, 2, 3]]));
    expect(doEmbed).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent identical calls', async () => {
    let releaseEmbed: (() => void) | null = null;
    const store = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const middleware = createEmbeddingCacheMiddleware({
      namespace: 'query-embedding',
      store,
      ttlSeconds: 60,
    });
    const doEmbed = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseEmbed = resolve;
      });

      return createEmbeddingResult([[4, 5, 6]]);
    });
    const params = { values: ['hello'] };

    const first = middleware.wrapEmbed?.({
      doEmbed: doEmbed as never,
      model: {} as never,
      params: params as never,
    });
    const second = middleware.wrapEmbed?.({
      doEmbed: doEmbed as never,
      model: {} as never,
      params: params as never,
    });

    await Promise.resolve();
    await Promise.resolve();
    if (!releaseEmbed) {
      throw new Error('Expected in-flight embedding request to be registered.');
    }
    const finishEmbed: () => void = releaseEmbed;
    finishEmbed();

    await expect(Promise.all([first, second])).resolves.toEqual([
      createEmbeddingResult([[4, 5, 6]]),
      createEmbeddingResult([[4, 5, 6]]),
    ]);
    expect(doEmbed).toHaveBeenCalledTimes(1);
  });

  it('fails open when the cache store errors', async () => {
    const store = {
      get: vi.fn().mockRejectedValue(new Error('redis unavailable')),
      set: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    const middleware = createEmbeddingCacheMiddleware({
      namespace: 'query-embedding',
      store,
      ttlSeconds: 60,
    });
    const doEmbed = vi.fn(async () => createEmbeddingResult([[7, 8, 9]]));

    await expect(
      middleware.wrapEmbed?.({
        doEmbed: doEmbed as never,
        model: {} as never,
        params: { values: ['hello'] } as never,
      }),
    ).resolves.toEqual(createEmbeddingResult([[7, 8, 9]]));

    expect(doEmbed).toHaveBeenCalledTimes(1);
    expect(requestLogger.warn).toHaveBeenCalled();
  });
});
