import { customType } from 'drizzle-orm/pg-core';

export const EMBEDDING_DIMENSIONS = 1536;

export function serializeVector(value: number[]) {
  if (value.length === 0) {
    throw new Error('Cannot serialize an empty vector.');
  }

  for (const component of value) {
    if (!Number.isFinite(component)) {
      throw new Error(
        `Cannot serialize a vector with non-finite component: ${component}.`,
      );
    }
  }

  return `[${value.join(',')}]`;
}

const vectorType = customType<{
  config: { dimensions: number };
  data: number[];
  driverData: string;
}>({
  dataType(config = { dimensions: EMBEDDING_DIMENSIONS }) {
    return `vector(${config.dimensions})`;
  },
  toDriver(value) {
    return serializeVector(value);
  },
  fromDriver(value) {
    return value.slice(1, -1).split(',').filter(Boolean).map(Number);
  },
});

export function vector(columnName: string, dimensions: number) {
  return vectorType(columnName, { dimensions });
}
