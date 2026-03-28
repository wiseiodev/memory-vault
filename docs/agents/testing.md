# Testing And Verification

Use these repo commands when validating work:
- `pnpm check` runs Biome with autofix enabled
- `pnpm test` runs unit tests
- `pnpm build` runs the production build
- `pnpm qc` runs `check`, `test`, and `build`

CI should use `pnpm check:ci` for non-mutating Biome validation.
