import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { auth } from '@/auth';

type RequireSessionOptions = {
  redirectTo?: string;
};

export const getSession = cache(async () =>
  auth.api.getSession({
    headers: await headers(),
  }),
);

export async function requireSession(options: RequireSessionOptions = {}) {
  const session = await getSession();

  if (!session) {
    redirect(options.redirectTo ?? '/login');
  }

  return session;
}

export async function getSessionFromRequest(requestHeaders: Headers) {
  return auth.api.getSession({
    headers: requestHeaders,
  });
}

export async function requireApiSession(requestHeaders: Headers) {
  const session = await getSessionFromRequest(requestHeaders);

  if (!session) {
    return null;
  }

  return session;
}
