import { customType } from 'drizzle-orm/pg-core';

export const EMBEDDING_DIMENSIONS = 1536;

const vectorType = customType<{
  config: { dimensions: number };
  data: number[];
  driverData: string;
}>({
  dataType(config = { dimensions: EMBEDDING_DIMENSIONS }) {
    return `vector(${config.dimensions})`;
  },
  toDriver(value) {
    return `[${value.join(',')}]`;
  },
  fromDriver(value) {
    return value.slice(1, -1).split(',').filter(Boolean).map(Number);
  },
});

export function vector(columnName: string, dimensions: number) {
  return vectorType(columnName, { dimensions });
}
