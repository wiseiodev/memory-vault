# Memory Vault

Memory Vault is a Vercel-first personal memory app built as a Turborepo.

## Workspace

- `apps/web`: Next.js App Router application
- `packages/tsconfig`: shared TypeScript configuration
- `packages/biome-config`: shared Biome configuration

Future packages are expected to live alongside the web app, including a Chrome extension and an MCP server.

## Tooling

- Node 24 via `.nvmrc`
- `pnpm@10.33.0`
- Turborepo for workspace task orchestration
- Biome for linting and formatting
- Vitest for unit testing
- Lefthook for git hooks

## Commands

```bash
pnpm install
pnpm check
pnpm check:ci
pnpm dev
pnpm qc
pnpm typecheck
pnpm test
pnpm build
```
