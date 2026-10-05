import { apiStore } from "@/lib/session";
import { parseView } from "@/lib/params";
import { bucketRows } from "@/lib/metrics/aggregate";
import { kpiOptions, loadCampaigns, loadDailyRows, loadProducts } from "@/lib/reports/queries";
import { ensureSettings } from "@/lib/sync/rollup";
import { toCsv } from "@/lib/reports/csv";

export const runtime = "nodejs";

const KPI_COLS = [
  ["Gross Sales", "grossSales"], ["Discounts", "discounts"], ["Returns", "returns"], ["Net Sales", "netSales"],
  ["Shipping Charged", "shippingCharged"], ["Taxes", "taxes"], ["Total Sales", "totalSales"], ["Orders", "orders"], ["AOV", "aov"],
  ["Meta Spend", "metaSpend"], ["Meta Revenue (attributed)", "metaPurchaseValue"], ["Meta Purchases", "metaPurchases"],
  ["Meta ROAS", "metaRoas"], ["Shopify ROAS", "shopifyRoas"], ["CPA", "cpa"], ["Product Cost", "productCost"],
  ["Units Missing Cost", "unitsMissingCost"], ["Shipping Cost", "shippingCost"], ["Payment Fees", "paymentFees"],
  ["Other Expenses", "otherExpenses"], ["Net Profit", "netProfit"], ["Profit Margin %", "profitMargin"], ["Break-even ROAS", "breakEvenRoas"],
] as const;

export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const ctx = await apiStore(req);
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { report } = await params;
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const view = parseView(sp, ctx.store);
  const settings = await ensureSettings(ctx.store.id);
  const opts = kpiOptions(settings);
  let csv: string;
  const cur = ctx.store.currency;

  if (report === "daily" || report === "weekly" || report === "monthly" || report === "profit") {
    const { rows } = await loadDailyRows(ctx.store.id, view.range, view.filters);
    const g = report === "weekly" ? "week" : report === "monthly" ? "month" : "day";
    const buckets = bucketRows(rows, g, opts, ctx.store.weekStartsOn);
    const cols = report === "profit"
      ? KPI_COLS.filter(([, k]) => ["netSales", "productCost", "unitsMissingCost", "metaSpend", "shippingCost", "paymentFees", "otherExpenses", "netProfit", "profitMargin", "shopifyRoas", "breakEvenRoas"].includes(k))
      : KPI_COLS;
    csv = toCsv(
      [g === "day" ? "Date" : g === "week" ? "Week starting" : "Month", ...cols.map(([h]) => `${h}${["Orders", "Units Missing Cost", "Meta Purchases", "Meta ROAS", "Shopify ROAS", "Profit Margin %", "Break-even ROAS"].includes(h) ? "" : ` (${cur})`}`), "Complete data"],
      buckets.map((b) => [b.key, ...cols.map(([, k]) => b.kpis[k] as number | null), b.totals.daysWithShopify === b.totals.days && b.totals.daysWithMeta === b.totals.days ? "yes" : "no"]),
    );
  } else if (report === "campaigns") {
    const { rows, attributionAvailable } = await loadCampaigns(ctx.store.id, view.range, view.filters);
    csv = toCsv(
      ["Campaign ID", "Campaign", "Status", `Spend (${cur})`, "Impressions", "Clicks", "CTR %", `CPC (${cur})`, "Meta Purchases", `Meta Revenue (${cur})`, "Meta ROAS", "Shopify Orders (UTM)", `Shopify Revenue (UTM, ${cur})`, "Shopify ROAS", `CPA (${cur})`, `Net Profit (${cur})`, "Margin %"],
      rows.map((r) => [
        r.campaignId, r.name, r.status, r.spend, r.impressions, r.linkClicks || r.clicks, r.ctr, r.cpc, r.purchases, r.metaRevenue, r.metaRoas,
        attributionAvailable ? r.shopifyOrders : null, attributionAvailable ? r.shopifyRevenue : null, attributionAvailable ? r.shopifyRoas : null,
        r.cpa, attributionAvailable ? r.netProfit : null, attributionAvailable ? r.profitMargin : null,
      ]),
    );
  } else if (report === "products") {
    const rows = await loadProducts(ctx.store.id, view.range);
    csv = toCsv(
      ["Product ID", "Product", "Units Sold", "Units Returned", `Gross Sales (${cur})`, `Discounts (${cur})`, `Returns (${cur})`, `Net Sales (${cur})`, `Product Cost (${cur})`, "Units Missing Cost", `Gross Profit (${cur})`, "Margin %", "Ad Spend Allocation"],
      rows.map((r) => [r.productId, r.title, r.unitsSold, r.unitsReturned, r.grossSales, r.discounts, r.returns, r.netSales, r.productCost, r.unitsMissingCost, r.grossProfit, r.margin, "Unavailable"]),
    );
  } else {
    return new Response("Unknown report", { status: 404 });
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report}-${view.range.from}_to_${view.range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
