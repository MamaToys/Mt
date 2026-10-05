# Metric definitions and calculation rules

Every number in the app is computed from data stored in PostgreSQL (Shopify
orders/refunds, Meta insights, user-entered costs and expenses). The code lives
in `src/lib/metrics/` and is covered by tests in `tests/`.

## Principles

| Rule | Where enforced |
|---|---|
| Missing data is **never** zero. A day not covered by a completed sync is `null`; a period total is `null` if any day is missing, and the UI shows **N/A** plus a coverage note. | `metrics/aggregate.ts` (`sumRows`), `metrics/rollup.ts` |
| No division produces Infinity/NaN — ratios with a zero/unavailable denominator are `null` → "N/A". | `metrics/formulas.ts` (`safeDiv`) |
| Orders are keyed by Shopify order ID; refunds by refund ID; re-syncs update in place. | Prisma unique constraints + `shopify/sync.ts` (`upsertOrder`) |
| Meta insights are keyed by (account, level, entity, date) and replaced per sync window; totals come from ONE level (account) so spend is never double counted. | `meta/sync.ts` (`syncInsightsWindow`), `sync/rollup.ts` |
| Currencies are converted only with an explicit rate; otherwise the amount is `null` and flagged. | `metrics/currency.ts` |
| Days are calendar days in the store timezone. | `metrics/dates.ts`, `shopify/normalize.ts` |

## Shopify sales (Shopify report conventions)

* **Gross sales** = Σ line-item `originalUnitPrice × quantity`, gift cards excluded, on the order's `processedAt` date.
* **Discounts** = Σ line-item discount allocations, on the order date.
* **Returns** = Σ refunded line-item subtotals (after discounts, before tax), on the **refund** date.
  A cancelled order whose items were not (fully) refunded — e.g. an unpaid order that was voided — has the remainder reversed on its cancellation date (`metrics/accounting.ts`).
* **Net sales** = gross sales − discounts − returns.
* **Shipping / taxes** = charged on the order date − refunded on the refund date.
* **Total sales** = net sales + shipping + taxes.
* **Refunds paid out** = money returned (all refund transactions) — shown separately, never subtracted twice.
* **Orders** = non-test orders placed; cancelled orders are still counted as placed.
* Test orders are excluded everywhere. Amounts are always `shopMoney` (shop currency), never presentment currency.

## Meta

* **Spend, impressions, clicks, link clicks** — as reported by Meta per day (ad-account timezone).
* **Purchases / purchase value** — exactly one action type per row, first present of
  `omni_purchase`, `purchase`, `offsite_conversion.fb_pixel_purchase`, `onsite_web_purchase`, `onsite_web_app_purchase`.
  Uses the account's unified attribution setting (`use_unified_attribution_setting=true`).
* Meta restates conversions for ~28 days; the daily job re-fetches the last 28 days.

## Formulas

| Metric | Formula |
|---|---|
| AOV | Net sales ÷ orders |
| Shopify ROAS | Net sales ÷ Meta spend |
| Meta ROAS | Meta purchase value ÷ Meta spend |
| Profit ROAS | Net profit ÷ Meta spend |
| CPA (blended) | Meta spend ÷ Shopify orders |
| Meta CPA | Meta spend ÷ Meta purchases |
| Net profit | Net sales − product cost − Meta spend − shipping costs − payment fees − other expenses |
| Net profit margin | Net profit ÷ net sales × 100 |
| Ad spend % | Meta spend ÷ net sales × 100 |
| Contribution margin (before ads) | (Net sales − product cost − shipping costs − payment fees − %-of-sales expenses) ÷ net sales |
| Break-even ROAS | (1 + ad-linked overhead rate) ÷ contribution margin; N/A if margin ≤ 0 |
| Discrepancy % | (Meta value − Shopify value) ÷ Shopify value × 100 |
| CTR / CPC / CPM | link clicks ÷ impressions × 100 / spend ÷ link clicks / spend ÷ impressions × 1000 |

## Costs

* **Product cost** — per unit, resolved for each line on the sale date: latest MANUAL cost (effective ≤ date) → Shopify "cost per item" → cost snapshot on the line item → **missing** (counted in `unitsMissingCost`, flagged in the UI). Restocked returns reverse their cost on the refund date.
* **Shipping cost** — Settings: none / flat per order / equal to shipping charged / % of net sales.
* **Payment fees** — `percent × order total + fixed × orders` (voided/expired orders excluded).
* **Expenses** — fixed one-time (on its date), daily, monthly (÷ days in that month, per day) or a % of net/gross/total sales or Meta spend per day. %-of-sales expenses are *variable* (reduce contribution margin); %-of-Meta-spend expenses are *ad overhead* (raise break-even ROAS).

## Aggregation

`DailyBusinessMetric`, `CampaignDailyMetric`, `ProductDailyMetric` are precomputed per store-local day by `sync/rollup.ts`.
Weekly (configurable week start) and monthly views are sums of daily rows; ratios are recomputed from the summed components (never averaged).
Partial weeks/months are labelled and excluded from period-over-period change columns.

## Forecast

Month-to-date actuals (complete days) + average of the last 14 complete days × remaining days. Labelled **FORECAST**; N/A if any basis day is missing.
