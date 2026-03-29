# Inngest Foundation

`LAB-119` now covers both the Inngest v4 migration and the first live ingestion
workflow/UI slice in the Next.js web app.

## Entry Points

- Shared client: `apps/web/src/inngest/client.ts`
- Typed events: `apps/web/src/inngest/events.ts`
- Realtime channel definitions: `apps/web/src/inngest/realtime.ts`
- Function registry: `apps/web/src/inngest/functions/index.ts`
- Serve endpoint: `apps/web/src/app/api/inngest/route.ts`
- Realtime token route: `apps/web/src/app/api/inngest/realtime-token/route.ts`

## SDK Version

- The web app uses `inngest@^4.1.0`
- Functions use v4 `triggers` in the first `createFunction()` argument
- Typed events use `eventType()`
- Serve-time config lives on the shared client, not in `serve()`

## Environment Variables

Use `apps/web/.env.local` for local app config. The example file at
`apps/web/.env.example` documents the supported Inngest variables:

- `INNGEST_DEV=1` for local development against the Inngest Dev Server
- `INNGEST_EVENT_KEY` for cloud event sending
- `INNGEST_SIGNING_KEY` for production request verification
- `INNGEST_SIGNING_KEY_FALLBACK` for signing-key rotation
- `INNGEST_BASE_URL` when the dev server is not running on the default port

## Runtime Configuration

- The shared Inngest client enables checkpointing with
  `checkpointing.maxRuntime = "240s"`
- `/api/inngest` exports `maxDuration = 300` for Vercel/serverless execution
- The ingestion workflow keeps `retries: 0` because retry policy is owned by
  `ingestion_jobs` in the database
- The ingestion workflow uses keyed concurrency on `event.data.jobId`

## Local Development

1. Run `pnpm dev`
2. Turbo starts the web app plus the persistent `sst:dev` and `inngest:dev`
   tasks together
3. The app-level `inngest:dev` script waits for
   `http://localhost:3000/api/inngest` before starting `inngest-cli`
4. Open the Inngest Dev Server and confirm it discovers
   `http://localhost:3000/api/inngest`
5. Use the `app/inngest.setup.ping` event or the `inngest-setup-ping`
   function to confirm the route is wired correctly
6. Create a note capture and verify it progresses through the ingestion stages
   in `/app`

You can still run `pnpm inngest:dev` directly, but that assumes the web app is
is already starting locally; the helper script will wait for the endpoint to
come up before launching the Inngest Dev Server.

## Realtime

- Realtime is scoped to the ingestion jobs card on `/app`
- The channel is per-user: `ingestion:${userId}`
- The current durable topic is `job-upsert`
- The browser gets a scoped subscription token from
  `/api/inngest/realtime-token`
- The client island lives in
  `apps/web/src/features/ingestion/components/ingestion-jobs-card-live.tsx`
- Workflow stage changes publish with `step.realtime.publish()`
- Retry requeue publishes a non-workflow update immediately so the card can
  reflect `queued` before the worker starts
- The client merges snapshots monotonically and refreshes authoritative data
  after reconnects so missed or out-of-order messages do not permanently rewind
  the UI

## Current Ingestion Scope

- Note captures are implemented end to end through Inngest
- File uploads and URL captures enter the same durable ingestion pipeline
- File and URL jobs currently fail intentionally with
  `EXTRACTOR_NOT_IMPLEMENTED`
- Real extraction/chunking follow-up work is tracked in `LAB-120`
- Embeddings/indexing follow-up work is tracked in `LAB-121`

## Notes

- This repo uses Inngest HTTP serve mode because the app is deployed on
  Vercel/Next.js rather than a long-running worker runtime
- The `/app` jobs surface remains server-rendered first; Realtime is kept in a
  small client component low in the tree
- `inngest-setup-ping` remains as a lightweight verification function, even
  though the app now also has a real ingestion workflow
