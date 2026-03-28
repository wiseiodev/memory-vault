# Feature Module Guidance

Domain code lives in `features/<domain>/`. Each feature owns its schemas, service, repository, router, and components.

## Structure

```
features/<domain>/
  index.ts          — barrel (components + types only, no server-only re-exports)
  schemas.ts        — Zod input/output schemas (hand-written)
  router.ts         — oRPC procedures
  service.ts        — business logic with DI via default params
  repository.ts     — data access (factory function, explicit type)
  components/       — React components
```

## Import rules

Biome enforces barrel-only imports from `@/features/*/` in `app/` files (`noRestrictedImports` in `biome.jsonc`).

Deep imports like `@/features/uploads/router` are allowed outside `app/` (e.g. in `rpc/router.ts`).

## Barrel exports

Barrels export only client-safe items: components and types. Server-only modules (service, repository, router, schemas) are not re-exported from the barrel — they're consumed via deep imports by their direct dependents.

## Adding a feature

1. Create `features/<domain>/` with the structure above
2. Barrel exports components + types
3. Register the feature router in `rpc/router.ts`
4. Pages import components from the barrel: `@/features/<domain>`
