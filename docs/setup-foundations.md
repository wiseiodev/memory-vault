# Setup Foundations

This document records the specific setup preferences and foundational
decisions chosen while completing `LAB-114`.

## App Direction

The project is a Vercel-first personal memory app monorepo.

Foundational product and platform choices:
- Deploy on Vercel
- Use Next.js App Router v16
- Keep a single app in `apps/web` for now
- Use a `src/` layout in the web app
- Keep the initial app surface intentionally narrow and foundation-focused

## Monorepo And Tooling

Repo structure and build-tooling choices locked in during `LAB-114`:
- `pnpm` workspaces
- `Turborepo`
- Tailwind enabled in the web app
- `Biome` as the only linting and formatting tool
- `Vitest` as the baseline test runner
- `Lefthook` for git hooks
- GitHub Actions for pull request checks

## Runtime And Toolchain

Version and local-tooling choices:
- `.nvmrc` pinned to Node `24`
- `packageManager` pinned to `pnpm@10.33.0`
- plain `pnpm` should be the normal command path after shell setup

## Early Platform Choices

These were selected early so later tickets could build toward a stable target:
- `Neon Postgres` as the database platform
- `S3` as the blob storage target
- `SES` as the future inbound email option if email ingestion is added

## Repo Workflow Conventions

Workflow and quality-gate conventions established during `LAB-114`:
- `pnpm check` for Biome autofix
- `pnpm check:ci` for non-mutating Biome checks
- `pnpm qc` for the combined quality pass
- conventional commits
- Linear issue IDs in commit footers using magic words like
  `Completes LAB-123`
- GitHub PR template in `.github/pull_request_template.md`
- Git commit template in `.gitmessage.txt`
- Linear canonical branch names should be used for issue work

## Intent

These decisions were made to finish the repo foundations once, keep the
project easy to deploy on Vercel, and make later tickets focus on product
behavior instead of re-deciding tooling and platform basics.
