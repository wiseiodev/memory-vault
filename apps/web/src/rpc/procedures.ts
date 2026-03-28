import 'server-only';

import { ORPCError, os } from '@orpc/server';

import { getAuth } from '@/auth';

const base = os.$context<{ headers: Headers }>();

export const authed = base.use(async ({ context, next }) => {
  const sessionData = await getAuth().api.getSession({
    headers: context.headers,
  });

  if (!sessionData?.session || !sessionData?.user) {
    throw new ORPCError('UNAUTHORIZED');
  }

  return next({
    context: { session: sessionData.session, user: sessionData.user },
  });
});
