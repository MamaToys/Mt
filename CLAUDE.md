@AGENTS.md

# Project notes

- Financial logic is pure and tested in `src/lib/metrics/`; keep DB code out of it.
- Never treat missing data as zero: use `null` and surface a gap message. Never return Infinity/NaN (use `safeDiv`).
- Keep Meta-attributed metrics and Shopify actuals separate in names, UI labels and AI prompts.
- All daily bucketing uses the store timezone (`src/lib/metrics/dates.ts`).
- Scripts that import `src/lib` must run with `tsx --conditions=react-server` (because of `server-only`).
- Checks: `npm run typecheck && npm run lint && npm test` (set `TEST_DATABASE_URL` for integration tests).
