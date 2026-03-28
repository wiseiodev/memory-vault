import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import type { AppRouter } from './router';

declare global {
  var $client: RouterClient<AppRouter> | undefined;
}

const link = new RPCLink({
  url: () => {
    if (typeof window === 'undefined') {
      throw new Error('RPCLink is not allowed on the server side.');
    }

    return `${window.location.origin}/rpc`;
  },
});

function resolveClient(): RouterClient<AppRouter> {
  return globalThis.$client ?? createORPCClient(link);
}

/**
 * Lazy proxy — resolves globalThis.$client at call-time, not module-load-time.
 * Safe to import from both server components (after server-client.ts sets $client)
 * and client components (falls back to RPCLink).
 */
export const rpc = new Proxy({} as RouterClient<AppRouter>, {
  get(_, prop) {
    return resolveClient()[prop as keyof RouterClient<AppRouter>];
  },
});
