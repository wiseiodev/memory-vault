import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getAuth } from '@/auth';

type RequireSessionOptions = {
  redirectTo?: string;
};

export async function getSession() {
  return getAuth().api.getSession({
    headers: await headers(),
  });
}

export async function requireSession(options: RequireSessionOptions = {}) {
  const session = await getSession();

  if (!session) {
    redirect(options.redirectTo ?? '/login');
  }

  return session;
}

export async function getSessionFromRequest(requestHeaders: Headers) {
  return getAuth().api.getSession({
    headers: requestHeaders,
  });
}

export async function getApiSession(requestHeaders: Headers) {
  return getSessionFromRequest(requestHeaders);
}
