# evlog Foundation

`LAB-142` adds the first shared logging foundation for the Next.js app.

## Entry Point

Server code should import logging helpers from `apps/web/src/lib/evlog.ts`.

That module is the single obvious app entrypoint for:

- `withEvlog` for request-scoped route wrapping
- `useLogger` for request-scoped context and structured error logging
- `createError` for actionable structured application errors

## Current Coverage

The initial setup intentionally stays narrow.

Wrapped route surfaces:

- `apps/web/src/app/api/auth/[...all]/route.ts`
- `apps/web/src/app/rpc/[[...rest]]/route.ts`

Next.js root instrumentation:

- `apps/web/src/instrumentation.ts`

## Usage Guidance

Use `log.set(...)` or `useLogger().set(...)` when you are adding durable request
context that should appear on the final wide event.

Use `useLogger().error(error, fields)` when an unexpected failure should be
attached to the current request with extra structured context.

Use `createError(...)` when the application should throw an actionable,
user-meaningful error with `message`, `why`, or `fix` metadata.

## Deferred Work

This foundation does not yet include:

- third-party drains
- client log transport
- broad route instrumentation
- worker or ingestion-runtime logging
- product analytics or feature tracking
