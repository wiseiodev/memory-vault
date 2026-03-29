import { toNextJsHandler } from 'better-auth/next-js';

import { getAuth } from '@/auth';
import { withEvlog } from '@/lib/evlog';

export const runtime = 'nodejs';

export const GET = withEvlog(async (request: Request) => {
  return toNextJsHandler(getAuth()).GET(request);
});

export const POST = withEvlog(async (request: Request) => {
  return toNextJsHandler(getAuth()).POST(request);
});
