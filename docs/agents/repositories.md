# Repository Guidance

Every domain repository follows the same conventions.

## Pattern

- Factory function: `createXxxRepository(db = getDb())`
- Explicit type: `export type XxxRepository = { ... }`
- `'server-only'` import guard
- Ownership check via space join: `eq(spaces.ownerUserId, input.userId)`
- Soft-delete filter: `isNull(table.deletedAt)`, `isNull(spaces.archivedAt)`
- Transactions for multi-table mutations
- Returns plain objects, not Drizzle row types

## DI in services

Services accept repositories as default parameters for testability:

```ts
export async function reserveUpload(
  input: ReserveUploadInput,
  deps = {
    repository: createUploadRepository(),
    spaceRepository: createSpaceRepository(),
  },
) { ... }
```

Tests pass mock implementations directly — no DI container needed.

## Spaces

Space queries (`findDefaultForUser`, `createDefaultForUser`, `findOwnedById`) live in `features/spaces/repository.ts`. Other features that need space resolution import from `@/features/spaces`.
