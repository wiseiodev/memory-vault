import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: './.env.local' });

const connectionString =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    'Missing a Postgres connection string for Drizzle. Expected DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING, DATABASE_URL, or POSTGRES_URL.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: connectionString,
  },
  strict: true,
  verbose: true,
});
