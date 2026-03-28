import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

declare global {
  var __memoryVaultPool: Pool | undefined;
}

function getConnectionString() {
  const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'Missing a pooled Postgres connection string. Expected POSTGRES_URL or DATABASE_URL.',
    );
  }

  return connectionString;
}

export function getPool() {
  const pool =
    globalThis.__memoryVaultPool ??
    new Pool({
      connectionString: getConnectionString(),
    });

  if (process.env.NODE_ENV !== 'production') {
    globalThis.__memoryVaultPool = pool;
  }

  return pool;
}

export function getDb() {
  return drizzle(getPool(), {
    schema,
  });
}
