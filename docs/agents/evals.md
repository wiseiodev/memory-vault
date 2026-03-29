# Evals Guidance

Use evals when a change can alter model behavior rather than just ordinary
application logic.

## Run Evals When

- You change an AI prompt.
- You change model selection or provider routing.
- You change AI Gateway fallback order.
- You change extraction schemas or structured-output expectations.
- You change the logic that decides when to use deterministic extraction versus
  AI fallback.
- You add or update eval fixtures intended to validate AI behavior.

## Current Command

- App-local eval run: `pnpm --filter web evals`
- The command now fails fast when `AI_GATEWAY_API_KEY` is missing so a no-op
  run cannot be mistaken for a real eval pass.

## Current Scope

The web app currently has a thin Evalite harness for extraction fallback
quality:

- hard web-page extraction through Vercel AI Gateway
- image OCR extraction through Vercel AI Gateway
- scanned PDF extraction through Vercel AI Gateway

The current harness lives in:

- `apps/web/evals/extraction-fallback.eval.ts`
- `apps/web/evalite.config.ts`

## Expected Workflow

1. Run normal verification first when you change code:
   - `pnpm --filter web test`
   - `pnpm --filter web build`
   - `pnpm check:ci`
2. Run `pnpm --filter web evals` when the change touches prompts, models,
   routing, fallback rules, or eval fixtures.
3. Mention eval results in your handoff whenever you ran them.

## Notes

- Evals are not a replacement for unit tests. Use both when a change affects
  the extraction pipeline and AI behavior.
- If the eval harness depends on credentials or local env, say that clearly in
  the handoff.
- When the change is purely deterministic and does not affect prompts, models,
  routing, or fallback behavior, unit tests plus normal repo verification are
  usually enough.
