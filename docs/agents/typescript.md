# TypeScript And Biome Guidance

This repo uses shared TypeScript and Biome configuration from the workspace.

Follow the repo's existing command flow:
- use `pnpm check` for Biome fixes
- use `pnpm check:ci` for non-mutating Biome checks

Prefer stable, behavioral guidance over file-path-specific notes:
- keep TypeScript strict
- follow existing import patterns instead of introducing alternate styles
- let Biome handle formatting and import organization

## Key packages

- **Zod v4** — API boundary validation. Use `z.record(z.string(), z.string())` (two args). Schemas are hand-written, not derived from drizzle-zod.
- **oRPC** (`@orpc/server`, `@orpc/client`) — type-safe RPC. See [orpc.md](./orpc.md).
- **Drizzle ORM** — database access. See [repositories.md](./repositories.md).
- **Better Auth** — auth via `getAuth()`. oRPC `authed` middleware handles session lookup.

For test and verification commands, see [testing.md](./testing.md).
