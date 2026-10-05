# Profit Dashboard — Shopify × Meta Ads

A production web app that answers, for one e-commerce store:

1. How much did I sell? (Shopify net sales)
2. How much did I spend on ads? (Meta spend)
3. How much money did I actually make? (net profit, margin)
4. Is my advertising profitable? (Shopify ROAS vs break-even ROAS — independent of Meta's own attribution)
5. What should I do next? (alerts + AI analysis grounded in your data)

It imports Shopify orders/refunds and Meta Ads insights into PostgreSQL, precomputes
daily metrics in the store's timezone, and shows dashboards, tables, alerts, forecasts,
CSV exports and AI analysis. **No fake data is ever shown as real**: unconnected or
unsynced sources show a setup state or N/A — missing data is never treated as zero.

See [`docs/METRICS.md`](docs/METRICS.md) for every formula and [`docs/ATTRIBUTION.md`](docs/ATTRIBUTION.md)
for how Meta attribution and Shopify revenue are kept apart. The same definitions are in-app under **Definitions**.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, server components, route handlers, server actions), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn-style components (Radix primitives), Recharts, light/dark mode |
| DB | PostgreSQL + Prisma 6 |
| Auth | better-auth (email + password, DB sessions, httpOnly cookies) |
| AI | Anthropic Claude via `@anthropic-ai/sdk`, server-side only |
| Jobs | Vercel Cron → `/api/cron/sync` (or any scheduler / `npm run sync`) |
| Tests | Vitest (unit + Postgres integration with mocked Shopify/Meta APIs) |

## Architecture

```
Shopify Admin GraphQL ──┐  webhooks (orders/create|updated|cancelled|delete, refunds/create)
  (OAuth or custom app) │  + 15-min incremental sync on updated_at cursor
                        ▼
                ShopifyOrder / LineItem / Refund / RefundLineItem   (unique per Shopify ID)
Meta Marketing API ─────▶ MetaAdAccount / Campaign / AdSet / Ad / MetaDailyInsight
  (OAuth or system user)    (account, campaign, ad set, ad level; replaced per window)
                        │
        rollup job (src/lib/sync/rollup.ts) — store timezone, FX, product costs, expenses
                        ▼
  DailyBusinessMetric · CampaignDailyMetric · ProductDailyMetric   (precomputed per day)
                        ▼
  Dashboard queries (src/lib/reports) → pages, CSV exports, alerts, AI context
```

Key directories:

```
prisma/schema.prisma          normalized schema (+ migrations)
src/lib/metrics/              pure financial logic: dates/timezones, formulas, accounting, expenses, FX, aggregation, forecast
src/lib/shopify/              GraphQL client (cost-based throttling), OAuth/HMAC, normalization, sync, UTM attribution
src/lib/meta/                 Graph API client (rate limits, token errors), OAuth, normalization, sync
src/lib/sync/                 orchestrator, rollup, sync logs, lease locks
src/lib/alerts/               alert rules (pure) + persistence
src/lib/ai/                   structured context builder, prompts, Claude service
src/lib/reports/              dashboard queries, CSV
src/app/(app)/                pages: dashboard, today, sales, meta-ads, campaigns, products, profitability, ai, alerts, expenses, integrations, sync-logs, definitions, settings
src/app/api/                  auth, sync, cron, webhooks, OAuth callbacks, AI, exports
tests/                        unit + integration tests
```

## Local setup

```bash
cp .env.example .env            # fill in DATABASE_URL, AUTH_SECRET, TOKEN_ENCRYPTION_KEY at minimum
npm install
npx prisma migrate deploy       # or: npm run db:migrate (development)
npm run dev                     # http://localhost:3000 → sign up
```

Generate secrets with `openssl rand -base64 32` (`AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` — the latter must be exactly 32 bytes base64).

### Development demo data (clearly labelled)

```bash
npm run db:seed-demo -- you@example.com   # user must already exist (sign up first)
```

Creates a store flagged `isDemo` with ~120 days of generated orders and Meta insights.
Every page shows a **"DEMO DATA — not real"** banner for it; demo stores are never synced.
Refuses to run when `NODE_ENV=production`.

## Environment variables

See [`.env.example`](.env.example). Summary:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `APP_URL` | yes | Public URL (OAuth redirects, webhook address) |
| `AUTH_SECRET` | yes | Session signing secret |
| `TOKEN_ENCRYPTION_KEY` | yes | AES-256-GCM key for stored Shopify/Meta tokens |
| `ALLOW_SIGNUP` | no | `false` to close sign-up after the owner account exists |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | for OAuth + webhooks | Shopify app credentials (secret also verifies webhook HMACs) |
| `SHOPIFY_API_VERSION` | no | Admin API version (default `2026-07`) |
| `SHOPIFY_SCOPES` | no | default `read_orders,read_all_orders,read_products,read_inventory` |
| `SHOPIFY_SHOP_DOMAIN` | no | Prefills the custom-app token form |
| `META_APP_ID` / `META_APP_SECRET` | for OAuth | Meta app credentials |
| `META_API_VERSION` | no | Graph API version (default `v24.0`) |
| `AI_API_KEY` | for AI | Anthropic API key (server-side only) |
| `AI_MODEL` | no | Claude model ID (defaults to the current Opus model) |
| `CRON_SECRET` | for cron | Bearer token required by `/api/cron/sync` |
| `INITIAL_HISTORY_DAYS` | no | History imported on first connect (default 730) |

No credential is ever sent to the browser. Platform tokens are encrypted at rest.

## Connecting the platforms

**Shopify** — Integrations page, either:
* *OAuth app*: create an app in the Shopify Dev Dashboard / Partners with redirect URL `${APP_URL}/api/integrations/shopify/callback`, set `SHOPIFY_CLIENT_ID/SECRET`, then enter your `*.myshopify.com` domain. `read_all_orders` (needed for >60 days of history) requires Shopify approval for public apps.
* *Custom app token*: Shopify admin → Settings → Apps → Develop apps → scopes `read_orders, read_all_orders, read_products, read_inventory` → paste the `shpat_…` token.

On connect the store adopts the shop's currency and IANA timezone, webhooks are
registered (when `APP_URL` is HTTPS and the client secret is set) and the initial
import starts. Shopify figures show N/A until the initial import completes.

**Meta** — set `META_APP_ID/SECRET` (redirect `${APP_URL}/api/integrations/meta/callback`, permissions `ads_read`, `business_management`) and click *Connect with Facebook*, or paste a system-user token with `ads_read`. Then choose which ad accounts to report on. Long-lived user tokens last ~60 days — the connection is marked **expired** and the UI asks you to reconnect when Meta rejects it; system-user tokens don't expire.

**Campaign attribution** — add these URL parameters to your Meta ads to enable campaign-level Shopify revenue:
`utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}`

**Currencies** — if an ad account bills in a different currency than the store, add exchange rates on the Integrations page; until then those amounts are reported as unavailable.

## Synchronization

| Job | When | What |
|---|---|---|
| Webhooks | seconds after a Shopify change | Re-fetch the changed order via the API, upsert, re-roll affected days (idempotent on webhook ID) |
| `recent` | every 15 min (`vercel.json`) | Shopify incremental (`updated_at` cursor, 10 min overlap), Meta today + previous 2 days, rollup, alerts |
| `daily` | 03:30 UTC | Shopify products/costs, Meta structure + last 28 days (restatements) + history backfill, 35-day re-rollup |
| Manual | "Sync now" button | Same as daily for the current store |
| CLI | `npm run sync -- <storeId> [mode] [minutes]` | Long initial imports outside serverless time limits |

Syncs are resumable (cursor advances only past saved orders), use lease locks so they
never overlap, back off on Shopify cost throttling and Meta rate limits, and record
every run in **Sync Logs**. A Shopify failure never blocks Meta (and vice versa); the
UI shows "Meta data unavailable — last successful sync: …" instead of zeros.

> Vercel Hobby only allows daily crons. On Hobby, call `/api/cron/sync?mode=recent`
> every 15 minutes from any external scheduler with `Authorization: Bearer $CRON_SECRET`.

## Deployment (Vercel + managed Postgres)

1. Create a Postgres database (Neon, Supabase, RDS, Vercel Postgres…) and set `DATABASE_URL`.
2. Set all required env vars in the Vercel project.
3. Build command `npm run build`; run `npx prisma migrate deploy` as part of the release.
4. Crons in `vercel.json` call `/api/cron/sync` (protected by `CRON_SECRET`).
5. Sign up as the owner, then set `ALLOW_SIGNUP=false`.

## Tests

```bash
npm test                                              # unit tests
TEST_DATABASE_URL=postgresql://…/profit_test npm test # + integration tests (run `prisma migrate deploy` on that DB first)
npm run typecheck && npm run lint
```

Covered: ROAS (Shopify/Meta/Profit), CPA, AOV, net profit, margin, break-even ROAS,
zero division, daily/weekly/monthly aggregation, refunds and partial refunds (on refund
date), cancellations, duplicate order/line/refund prevention across re-syncs, stale
webhook payloads, duplicate Meta insight prevention and single-level spend totals,
currency conversion and missing rates, timezone bucketing and DST, UTM attribution,
alert rules, CSV escaping, webhook/OAuth HMAC verification.

## AI analysis

The AI receives a compact JSON of aggregates built by `src/lib/ai/context.ts` (period
KPIs, previous period, changes, a daily/weekly series, top campaigns, data gaps and
freshness — no customer data) and is instructed to use only that data, separate Meta
attribution from Shopify results, explain calculations, avoid unsupported causation and
never recommend on missing data. Inputs and outputs are saved in `AIAnalysis` for audit.
