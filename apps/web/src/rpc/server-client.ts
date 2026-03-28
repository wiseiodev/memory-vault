import 'server-only';

import { createRouterClient } from '@orpc/server';
import { headers } from 'next/headers';
import { appRouter } from './router';

globalThis.$client = createRouterClient(appRouter, {
  context: async () => ({ headers: await headers() }),
});
