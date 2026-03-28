# Auth Foundation

LAB-115 establishes the first authentication and database foundation for Memory
Vault.

## Decisions

- Better Auth is the auth framework for the web app.
- Google is the only supported sign-in method in v1.
- Product routes live under `/app` and are protected server-side.
- Sessions are persisted in Neon-backed Postgres.
- Drizzle with `node-postgres` is the repo-standard application database layer.
- Preview deployments use Better Auth's OAuth proxy pattern instead of requiring
  a separate public client base URL.

## Route Policy

- `/` stays public.
- `/login` is public and hosts the Google sign-in action.
- `/app` is protected and should only render after session validation on the
  server.
- Future protected route handlers should use the shared server auth helpers
  instead of duplicating session lookup logic.

## Environment Contract

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- pooled Postgres runtime URL via `POSTGRES_URL` or `DATABASE_URL`
- unpooled migration URL via `DATABASE_URL_UNPOOLED` or
  `POSTGRES_URL_NON_POOLING`

## Future Compatibility

- The Better Auth user ID is the identity root for later memory-domain tables.
- Session persistence is compatible with later extension device-token work.
- Account deletion is deferred, but the auth/storage model is chosen so user
  identity and sessions can be invalidated centrally.
