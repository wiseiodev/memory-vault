import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { prefixedId, softDelete, timestamps, ulid } from '../columns';
import { user } from './auth';

export const spaces = pgTable(
  'spaces',
  {
    id: prefixedId('id', 'spc'),
    ownerUserId: ulid('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug'),
    description: text('description'),
    isDefault: boolean('is_default').default(false).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...softDelete,
    ...timestamps,
  },
  (table) => [
    index('spaces_owner_idx').on(table.ownerUserId),
    index('spaces_owner_created_idx').on(table.ownerUserId, table.createdAt),
    uniqueIndex('spaces_owner_slug_uidx')
      .on(table.ownerUserId, table.slug)
      .where(sql`${table.slug} is not null and ${table.deletedAt} is null`),
    uniqueIndex('spaces_owner_default_uidx')
      .on(table.ownerUserId)
      .where(
        sql`${table.isDefault} = true and ${table.deletedAt} is null and ${table.archivedAt} is null`,
      ),
  ],
);
