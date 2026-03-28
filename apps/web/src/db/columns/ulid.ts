import { customType } from 'drizzle-orm/pg-core';

export const ulid = customType<{ data: string }>({
  dataType() {
    return 'text';
  },
});
