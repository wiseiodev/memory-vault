import { timestamp } from 'drizzle-orm/pg-core';

import { generateId, type IdPrefix } from './id';
import { ulid } from './ulid';

export const softDelete = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

export function prefixedId(columnName: string, prefix: IdPrefix) {
  return ulid(columnName)
    .notNull()
    .$default(() => generateId(prefix))
    .primaryKey();
}

export function defaultId(prefix: IdPrefix) {
  return {
    id: prefixedId('id', prefix),
  } as const;
}
