# TypeScript And Biome Guidance

This repo uses shared TypeScript and Biome configuration from the workspace.

Follow the repo's existing command flow:
- use `pnpm check` for Biome fixes
- use `pnpm check:ci` for non-mutating Biome checks

Prefer stable, behavioral guidance over file-path-specific notes:
- keep TypeScript strict
- follow existing import patterns instead of introducing alternate styles
- let Biome handle formatting and import organization

For test and verification commands, see [testing.md](./testing.md).
