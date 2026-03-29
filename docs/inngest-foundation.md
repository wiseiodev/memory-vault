# Inngest Foundation

`LAB-119` begins with the app-level Inngest setup for the Next.js web app.

## Entry Points

- Shared client: `apps/web/src/inngest/client.ts`
- Function registry: `apps/web/src/inngest/functions/index.ts`
- Serve endpoint: `apps/web/src/app/api/inngest/route.ts`

## Environment Variables

Use `apps/web/.env.local` for local app config. The example file at
`apps/web/.env.example` documents the supported Inngest variables:

- `INNGEST_DEV=1` for local development against the Inngest Dev Server
- `INNGEST_EVENT_KEY` for cloud event sending
- `INNGEST_SIGNING_KEY` for production request verification
- `INNGEST_SIGNING_KEY_FALLBACK` for signing-key rotation
- `INNGEST_BASE_URL` when the dev server is not running on the default port

## Local Development

1. Run the app with `pnpm dev`
2. `pnpm dev` now also starts the Inngest Dev Server alongside Next.js and SST
3. The Inngest task waits until `http://localhost:3000/api/inngest` responds
   before launching `inngest-cli`, so local startup is less race-prone
4. Open the Dev Server and confirm it discovers `http://localhost:3000/api/inngest`
5. Use the `app/inngest.setup.ping` event or the synced `inngest-setup-ping`
   function to confirm the route is wired correctly

You can still run `pnpm inngest:dev` directly if you only want the Inngest Dev
Server without the full repo dev stack.

## Notes

- This repo uses Inngest's HTTP serve mode because the app is deployed on
  Vercel/Next.js rather than a long-running worker runtime.
- The initial setup registers a single typed verification function so local sync
  and invocation can be validated before LAB-119 adds real ingestion workflows.
