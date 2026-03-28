import { timestamp } from 'drizzle-orm/pg-core';

import { generateId, type IdPrefix } from './id';
import { ulid } from './ulid';

export const timestamps = {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
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
