import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { prefixedId, timestamps, ulid } from '../columns';

export const user = pgTable(
  'user',
  {
    id: prefixedId('id', 'user'),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    ...timestamps,
  },
  () => [],
);

export const session = pgTable(
  'session',
  {
    id: prefixedId('id', 'sess'),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    ...timestamps,
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: ulid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: prefixedId('id', 'acct'),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: ulid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [
    index('account_account_id_idx').on(table.accountId),
    index('account_provider_id_idx').on(table.providerId),
    index('account_user_id_idx').on(table.userId),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: prefixedId('id', 'veri'),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    ...timestamps,
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);
