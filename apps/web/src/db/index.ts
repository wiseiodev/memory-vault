import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'Missing a pooled Postgres connection string. Expected POSTGRES_URL or DATABASE_URL.',
  );
}

declare global {
  var __memoryVaultPool: Pool | undefined;
}

const pool =
  globalThis.__memoryVaultPool ??
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__memoryVaultPool = pool;
}

export { pool };
export const db = drizzle(pool, {
  schema,
});
