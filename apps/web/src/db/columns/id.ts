import { ulid as createUlid } from 'ulidx';

export type IdPrefix =
  | 'acct'
  | 'blob'
  | 'ccur'
  | 'cite'
  | 'dtok'
  | 'evres'
  | 'evrun'
  | 'job'
  | 'mem'
  | 'seg'
  | 'sess'
  | 'spc'
  | 'src'
  | 'user'
  | 'veri';

export function generateId<T extends IdPrefix>(prefix: T): `${T}_${string}` {
  return `${prefix}_${createUlid()}`;
}
