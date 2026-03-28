import { ulid as createUlid } from 'ulidx';

export type IdPrefix = 'acct' | 'sess' | 'user' | 'veri';

export function generateId<T extends IdPrefix>(prefix: T): `${T}_${string}` {
  return `${prefix}_${createUlid()}`;
}
