# Testing And Verification

Use these repo commands when validating work:
- `pnpm check` runs Biome with autofix enabled
- `pnpm test` runs unit tests
- `pnpm build` runs the production build
- `pnpm qc` runs `check`, `typecheck`, `test`, and `build`

CI should use `pnpm check:ci` for non-mutating Biome validation.

## Test conventions

- Tests colocated with source: `service.test.ts` next to `service.ts`
- Service tests use DI — pass mock repositories/deps via default params
- oRPC procedure tests: procedure-level, import handler, call with mock context + input
- `vi.mock()` for module-level mocks, `vi.fn()` for individual functions
- jsdom environment for component tests, node for server tests
