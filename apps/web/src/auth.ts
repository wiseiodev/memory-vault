import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { oAuthProxy } from 'better-auth/plugins/oauth-proxy';

import { getDb } from './db';
import * as schema from './db/schema';
import { buildBaseUrlOptions } from './lib/server/auth/origins';

function getRequiredAuthEnv() {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const betterAuthUrl = process.env.BETTER_AUTH_URL;

  if (!googleClientId || !googleClientSecret || !betterAuthUrl) {
    throw new Error(
      'Missing Better Auth env vars. Expected BETTER_AUTH_URL, GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET.',
    );
  }

  return {
    betterAuthUrl,
    googleClientId,
    googleClientSecret,
  };
}

function createAuth() {
  const { betterAuthUrl, googleClientId, googleClientSecret } =
    getRequiredAuthEnv();

  return betterAuth({
    appName: 'Memory Vault',
    baseURL: buildBaseUrlOptions({
      baseUrl: betterAuthUrl,
    }),
    advanced: {
      database: {
        generateId: false,
      },
      useSecureCookies: process.env.NODE_ENV === 'production',
    },
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema,
    }),
    socialProviders: {
      google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        prompt: 'select_account',
        redirectURI: new URL(
          '/api/auth/callback/google',
          betterAuthUrl,
        ).toString(),
        overrideUserInfoOnSignIn: true,
      },
    },
    plugins: [
      oAuthProxy({
        productionURL: betterAuthUrl,
      }),
      nextCookies(),
    ],
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  if (authInstance) {
    return authInstance;
  }

  authInstance = createAuth();

  return authInstance;
}
