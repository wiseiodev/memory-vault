import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { oAuthProxy } from 'better-auth/plugins/oauth-proxy';

import { db } from './db';
import * as schema from './db/schema';
import { buildTrustedOrigins } from './lib/server/auth/origins';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const betterAuthUrl = process.env.BETTER_AUTH_URL;

if (!googleClientId || !googleClientSecret || !betterAuthUrl) {
  throw new Error(
    'Missing Better Auth env vars. Expected BETTER_AUTH_URL, GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET.',
  );
}

export const auth = betterAuth({
  appName: 'Memory Vault',
  advanced: {
    database: {
      generateId: false,
    },
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
  database: drizzleAdapter(db, {
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
  trustedOrigins: buildTrustedOrigins({
    baseUrl: betterAuthUrl,
    vercelUrl: process.env.VERCEL_URL,
  }),
  plugins: [oAuthProxy(), nextCookies()],
});
