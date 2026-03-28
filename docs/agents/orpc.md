# oRPC Guidance

All API procedures go through oRPC. A single catch-all route at `app/rpc/[[...rest]]/route.ts` handles all RPC traffic — do not create individual API route files for new endpoints.

## Key files

- `rpc/procedures.ts` — base procedure builder + `authed` middleware (Better Auth session via `getAuth().api.getSession`)
- `rpc/router.ts` — root router assembling feature routers
- `rpc/client.ts` — browser + server typed client (lazy Proxy, resolves `globalThis.$client` at call-time)
- `rpc/server-client.ts` — sets `globalThis.$client` for RSC (imported in `app/app/layout.tsx`)

## Adding a procedure

1. Define Zod input + output schemas in the feature's `schemas.ts`
2. Create the procedure in the feature's `router.ts` using `authed.input(...).output(...).handler(...)`
3. Register the feature router in `rpc/router.ts`

## Client usage

Client components: `import { rpc } from '@/rpc/client'` — type-safe end-to-end.

Server components: same import works — the lazy Proxy resolves to the server-side client when `globalThis.$client` is set.

## Error handling

Service functions throw `ORPCError` from `@orpc/server` with codes: `NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED`, `BAD_REQUEST`.

The RPC handler's `onError` interceptor only logs unexpected errors — expected codes are filtered.
