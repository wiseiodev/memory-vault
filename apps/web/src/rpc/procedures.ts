import 'server-only';

import { ORPCError, os } from '@orpc/server';
import { getAuth } from '@/auth';
import { authenticateDeviceToken } from '@/features/device-tokens/service';

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

export const extensionAuthed = base.use(async ({ context, next }) => {
  const extensionActor = await authenticateDeviceToken(context.headers);

  if (!extensionActor) {
    throw new ORPCError('UNAUTHORIZED');
  }

  return next({
    context: {
      extension: extensionActor,
    },
  });
});
