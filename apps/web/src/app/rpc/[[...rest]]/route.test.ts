/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestLogger = {
  error: vi.fn(),
  set: vi.fn(),
};

const withEvlog = vi.fn(
  <TArgs extends unknown[], TReturn>(handler: (...args: TArgs) => TReturn) =>
    (...args: TArgs) =>
      handler(...args),
);

const handle = vi.fn();
const onErrorCallbacks: Array<(error: unknown) => void> = [];

class MockORPCError extends Error {
  code: string;

  constructor(code: string, options?: { message?: string }) {
    super(options?.message ?? code);
    this.code = code;
  }
}

vi.mock('@/lib/evlog', () => ({
  getRequestLogger: vi.fn(() => requestLogger),
  useLogger: vi.fn(() => requestLogger),
  withEvlog,
}));

vi.mock('@orpc/server', () => ({
  ORPCError: MockORPCError,
  onError: (callback: (error: unknown) => void) => {
    onErrorCallbacks.push(callback);
    return callback;
  },
}));

vi.mock('@orpc/server/fetch', () => ({
  RPCHandler: class {
    handle = handle;
  },
}));

vi.mock('@/rpc/router', () => ({
  appRouter: {},
}));

describe('rpc route', () => {
  beforeEach(() => {
    handle.mockReset();
    onErrorCallbacks.length = 0;
    requestLogger.error.mockReset();
    requestLogger.set.mockReset();
    withEvlog.mockClear();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('wraps the request handler with evlog and returns 404 when the router does not match', async () => {
    handle.mockResolvedValue({
      response: null,
    });

    const route = await import('./route');
    const response = await route.GET(new Request('https://example.com/rpc'));

    expect(withEvlog).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  });

  it('returns CORS headers for allowlisted extension preflight requests', async () => {
    vi.stubEnv('CHROME_EXTENSION_IDS', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    const route = await import('./route');
    const response = await route.OPTIONS(
      new Request('https://example.com/rpc', {
        headers: {
          origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        method: 'OPTIONS',
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
      'GET, POST, OPTIONS',
    );
  });

  it('applies allowlisted extension CORS headers to regular responses too', async () => {
    vi.stubEnv('CHROME_EXTENSION_IDS', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    handle.mockResolvedValue({
      response: null,
    });

    const route = await import('./route');
    const response = await route.GET(
      new Request('https://example.com/rpc', {
        headers: {
          origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
  });

  it('logs unexpected RPC errors through the request logger', async () => {
    await import('./route');

    expect(onErrorCallbacks).toHaveLength(1);

    const error = new Error('boom');
    onErrorCallbacks[0](error);

    expect(requestLogger.error).toHaveBeenCalledWith(error, {
      action: 'rpc.unexpected_error',
    });
  });

  it('keeps expected ORPC errors quiet', async () => {
    await import('./route');

    onErrorCallbacks[0](
      new MockORPCError('NOT_FOUND', {
        message: 'expected miss',
      }),
    );

    expect(requestLogger.error).not.toHaveBeenCalled();
  });
});
