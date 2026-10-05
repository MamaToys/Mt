import { PageHeader } from "@/components/dash/notices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Definitions — Profit Dashboard" };

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Shopify sales (actual store revenue)",
    items: [
      ["Gross sales", "Σ (line item original unit price × quantity), excluding gift cards (a liability, not a sale), taxes and shipping. Reported on the order's processed date in the store timezone. Same definition as Shopify's sales reports."],
      ["Discounts", "Σ discount allocations on line items (order and line discounts). Shipping discounts reduce shipping, not sales."],
      ["Returns", "Merchandise value of refunded line items (after discounts, before tax), reported on the date of the refund — not the order date — as Shopify does. A cancelled order whose items were never refunded (e.g. an unpaid order that was voided) is reversed on its cancellation date so it nets to zero."],
      ["Refunds paid out", "Money actually returned to customers (including refunded tax and shipping). Shown separately; it is not subtracted twice."],
      ["Net sales", "Gross sales − discounts − returns."],
      ["Shipping / Taxes", "Charged to customers on the order date, minus amounts refunded on the refund date."],
      ["Total sales", "Net sales + shipping + taxes."],
      ["Orders", "Non-test Shopify orders placed in the period, identified by Shopify order ID (each order is stored once and updated in place, never double counted). Cancelled orders count when placed; their sales are reversed when cancelled."],
      ["AOV", "Net sales ÷ orders."],
    ],
  },
  {
    title: "Meta Ads (platform-attributed)",
    items: [
      ["Meta spend", "Spend reported by Meta at ad-account level for the selected accounts, converted to the reporting currency with an explicit exchange rate. Totals always come from a single reporting level so spend is never double counted."],
      ["Meta purchases / Meta revenue", "Purchases and purchase conversion value attributed by Meta using the account's attribution setting. Exactly one action type is used per row, in priority order: omni_purchase, purchase, offsite_conversion.fb_pixel_purchase, onsite_web_purchase. Meta may count view-through and cross-device conversions and restates data for up to 28 days."],
      ["Meta ROAS", "Meta-attributed purchase conversion value ÷ Meta spend."],
      ["Meta CPA", "Meta spend ÷ Meta-reported purchases."],
      ["CTR / CPC / CPM", "Link clicks ÷ impressions × 100; spend ÷ link clicks; spend ÷ impressions × 1,000."],
    ],
  },
  {
    title: "Combined metrics",
    items: [
      ["Shopify ROAS", "Shopify net sales ÷ Meta spend. Independent of Meta's attribution: what the store actually took in per unit of Meta spend (includes sales from all channels)."],
      ["CPA (blended)", "Meta spend ÷ Shopify orders."],
      ["Ad spend %", "Meta spend ÷ net sales × 100."],
      ["Net profit", "Net sales − product cost − Meta spend − shipping costs − payment fees − other expenses."],
      ["Net profit margin", "Net profit ÷ net sales × 100. N/A when net sales are 0."],
      ["Profit ROAS", "Net profit ÷ Meta spend."],
      ["Contribution margin before advertising", "(Net sales − product cost − shipping costs − payment fees − percentage-of-sales expenses) ÷ net sales. Fixed overheads are excluded because they don't scale with each sale."],
      ["Break-even ROAS", "(1 + ad-linked overhead rate) ÷ contribution margin. Ad-linked overhead covers expenses defined as a % of Meta spend (e.g. agency fees). Example: 40 % margin, no overhead → 1 ÷ 0.40 = 2.50x. If the margin is ≤ 0 no ROAS can break even (shown as N/A)."],
      ["Meta vs Shopify difference %", "(Meta value − Shopify value) ÷ Shopify value × 100."],
    ],
  },
  {
    title: "Costs",
    items: [
      ["Product cost", "Units sold × cost per unit on the sale date. Manual costs (Products page) override Shopify's 'Cost per item'. Units with no known cost are flagged as missing — never assumed to be zero — and profit is marked as excluding them. Restocked returns reverse their cost on the refund date."],
      ["Shipping costs", "What the store pays carriers, per the model in Settings: none, flat per order, equal to shipping charged, or % of net sales."],
      ["Payment fees", "Payment fee % × order total + fixed fee per order (voided/expired orders excluded)."],
      ["Other expenses", "Expenses page: fixed one-time (on its date), daily, monthly (spread evenly over the days of each month), or a % of net/gross/total sales or Meta spend per day."],
    ],
  },
  {
    title: "Attribution",
    items: [
      ["Platform attribution vs actual revenue", "Meta-attributed numbers are Meta's model of which sales its ads caused. Shopify numbers are what the store actually sold. They are never mixed in one metric."],
      ["Campaign-level Shopify revenue", "Only available through UTM matching: the last visit before purchase must carry utm_campaign equal to the Meta campaign ID (recommended: utm_campaign={{campaign.id}}) or, with a Meta utm_source, the exact campaign name. Ad set and ad matching use utm_term={{adset.id}} and utm_content={{ad.id}}. Unmatched orders are not assigned; when no orders match, campaign Shopify revenue shows 'attribution unavailable'."],
      ["Product-level ad spend", "Not allocated. Meta spend cannot be reliably attributed to products, so product profit is gross profit before advertising."],
    ],
  },
  {
    title: "Time, currency and data freshness",
    items: [
      ["Timezone", "All Shopify days are calendar days in the store timezone (Settings). Meta reports days in the ad account's timezone; if they differ, a notice is shown because daily figures can be offset."],
      ["Currency", "All figures are in the reporting currency. Shopify amounts use the shop currency (never the customer's presentment currency). Other currencies are converted only with an exchange rate you provide; if none exists the amount is reported as unavailable."],
      ["Missing data", "Days not covered by a completed sync are shown as N/A. A period total is N/A if any day in it is missing — missing data is never treated as zero."],
      ["Freshness", "Shopify: webhooks within seconds (when configured) plus a sync every 15 minutes. Meta: today and the previous 2 days every 15 minutes, the last 28 days daily (Meta restates conversions). Neither source is literally real-time."],
      ["Forecast", "Month-to-date actuals plus the last 14 complete days' daily average × remaining days. Always labelled FORECAST; never mixed with actuals."],
    ],
  },
];

export default function DefinitionsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Data definitions" description="How every number in this app is calculated. Every figure is traceable to Shopify orders/refunds or Meta insights stored in the database." />
      {GROUPS.map((g) => (
        <Card key={g.title}>
          <CardHeader><CardTitle>{g.title}</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 md:grid-cols-[220px_1fr]">
              {g.items.map(([term, def]) => (
                <div key={term} className="contents">
                  <dt className="text-sm font-medium">{term}</dt>
                  <dd className="text-sm text-muted-foreground">{def}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
