import "server-only";
import { db } from "../db";
import { Kpis, bucketRows, computeKpis, kpiChanges, sumRows } from "../metrics/aggregate";
import { DateRange, daysInRange, fromDbDate, toDbDate } from "../metrics/dates";
import { round } from "../metrics/formulas";
import { Filters, kpiOptions, loadCampaigns, loadDailyRows, loadFreshness } from "../reports/queries";
import { ensureSettings } from "../sync/rollup";

/**
 * Builds the structured, aggregated metrics the AI receives. Only store-level
 * aggregates and campaign metrics — never customer names, emails, addresses or
 * order-level personal data.
 */

const r2 = (v: number | null | undefined) => (v === null || v === undefined ? null : round(v, 2));

function slimKpis(k: Kpis) {
  return {
    grossSales: r2(k.grossSales),
    discounts: r2(k.discounts),
    returns: r2(k.returns),
    netSales: r2(k.netSales),
    orders: k.orders,
    aov: r2(k.aov),
    metaSpend: r2(k.metaSpend),
    metaAttributedRevenue: r2(k.metaPurchaseValue),
    metaReportedPurchases: r2(k.metaPurchases),
    shopifyRoas: r2(k.shopifyRoas),
    metaRoas: r2(k.metaRoas),
    profitRoas: r2(k.profitRoas),
    blendedCpa: r2(k.cpa),
    metaCpa: r2(k.metaCpa),
    productCost: r2(k.productCost),
    productCostComplete: k.productCostComplete,
    unitsMissingCost: k.unitsMissingCost,
    shippingCost: r2(k.shippingCost),
    paymentFees: r2(k.paymentFees),
    otherExpenses: r2(k.otherExpenses),
    netProfit: r2(k.netProfit),
    profitMarginPct: r2(k.profitMargin),
    adSpendPctOfNetSales: r2(k.adSpendPct),
    contributionMarginPct: k.contributionMargin === null ? null : r2(k.contributionMargin * 100),
    breakEvenRoas: r2(k.breakEvenRoas),
    breakEvenStatus: k.breakEvenStatus,
    refundRatePct: r2(k.refundRate),
    ctrPct: r2(k.ctr),
    cpc: r2(k.cpc),
    cpm: r2(k.cpm),
    dataGaps: k.gaps,
  };
}

export async function buildAiContext(storeId: string, range: DateRange, compare: DateRange | null, filters: Filters = {}, campaignId?: string) {
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId } });
  const settings = await ensureSettings(storeId);
  const opts = kpiOptions(settings);
  const f = campaignId ? { ...filters, campaign: campaignId } : filters;
  const [cur, prev, campaigns, prevCampaigns, freshness, alerts] = await Promise.all([
    loadDailyRows(storeId, range, f),
    compare ? loadDailyRows(storeId, compare, f) : Promise.resolve(null),
    loadCampaigns(storeId, range, campaignId ? { campaign: campaignId } : {}),
    compare ? loadCampaigns(storeId, compare, campaignId ? { campaign: campaignId } : {}) : Promise.resolve(null),
    loadFreshness(storeId),
    db.alert.findMany({ where: { storeId, dismissedAt: null, date: { gte: toDbDate(range.from) } }, orderBy: { date: "desc" }, take: 10 }),
  ]);
  const k = computeKpis(sumRows(cur.rows), opts);
  const pk = prev ? computeKpis(sumRows(prev.rows), opts) : null;
  const len = daysInRange(range.from, range.to);
  const g = len > 92 ? "month" : len > 31 ? "week" : "day";
  const series = bucketRows(cur.rows, g, opts, store.weekStartsOn).map((b) => ({
    period: b.key,
    netSales: r2(b.kpis.netSales),
    orders: b.kpis.orders,
    metaSpend: r2(b.kpis.metaSpend),
    shopifyRoas: r2(b.kpis.shopifyRoas),
    metaRoas: r2(b.kpis.metaRoas),
    netProfit: r2(b.kpis.netProfit),
    profitMarginPct: r2(b.kpis.profitMargin),
  }));
  const prevById = new Map((prevCampaigns?.rows ?? []).map((c) => [c.campaignId, c]));
  const topCampaigns = campaigns.rows.slice(0, 25).map((c) => {
    const p = prevById.get(c.campaignId);
    return {
      campaign: c.name,
      status: c.status,
      spend: r2(c.spend),
      impressions: c.impressions,
      ctrPct: r2(c.ctr),
      cpc: r2(c.cpc),
      metaReportedPurchases: r2(c.purchases),
      metaAttributedRevenue: r2(c.metaRevenue),
      metaRoas: r2(c.metaRoas),
      utmAttributedShopifyOrders: c.shopifyOrders,
      utmAttributedShopifyNetSales: r2(c.shopifyRevenue),
      shopifyRoas: r2(c.shopifyRoas),
      contributionAfterAdSpend: r2(c.netProfit),
      previousPeriod: p ? { spend: r2(p.spend), metaRoas: r2(p.metaRoas), shopifyRoas: r2(p.shopifyRoas), contributionAfterAdSpend: r2(p.netProfit) } : null,
    };
  });
  const lastOrder = await db.shopifyOrder.findFirst({ where: { storeId }, orderBy: { processedAt: "desc" }, select: { processedAt: true } });
  return {
    store: { currency: store.currency, timezone: store.timezone, isDemoData: store.isDemo },
    dateRange: range,
    comparisonRange: compare,
    scope: cur.scope,
    scopeNotes: cur.notes,
    current: slimKpis(k),
    previousPeriod: pk ? slimKpis(pk) : null,
    changesPct: pk
      ? Object.fromEntries(
          Object.entries(kpiChanges(k, pk, ["netSales", "orders", "metaSpend", "shopifyRoas", "metaRoas", "netProfit", "profitMargin", "cpa", "aov"] as const)).map(([a, b]) => [a, r2(b)]),
        )
      : null,
    series: { granularity: g, rows: series },
    campaigns: {
      shopifyAttributionAvailable: campaigns.attributionAvailable,
      attributionMethod: "Last-visit UTM match (utm_campaign = Meta campaign ID or exact name). Unmatched orders are not assigned.",
      rows: topCampaigns,
      totalCampaignsWithSpend: campaigns.rows.length,
    },
    targets: {
      targetRoas: settings.targetRoas === null ? null : Number(settings.targetRoas),
      targetCpa: settings.targetCpa === null ? null : Number(settings.targetCpa),
      targetProfitMarginPct: settings.targetProfitMargin === null ? null : Number(settings.targetProfitMargin) * 100,
    },
    openAlerts: alerts.map((a) => ({ date: fromDbDate(a.date), severity: a.severity, title: a.title, message: a.message })),
    dataFreshness: {
      shopifyLastSuccessfulSync: freshness.shopify?.lastSuccessfulSyncAt ?? null,
      shopifyStatus: freshness.shopify?.status ?? "NOT_CONNECTED",
      shopifyInitialImportComplete: freshness.shopify?.initialImportComplete ?? false,
      metaLastSuccessfulSync: freshness.meta?.lastSuccessfulSyncAt ?? null,
      metaStatus: freshness.meta?.status ?? "NOT_CONNECTED",
      latestOrderAt: lastOrder?.processedAt ?? null,
      metricsComputedAt: freshness.computedAt,
      note: "Meta insights are delayed and restated by Meta for up to 28 days; today's figures are partial.",
    },
  };
}
export type AiContext = Awaited<ReturnType<typeof buildAiContext>>;
