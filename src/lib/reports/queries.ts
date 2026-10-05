import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { DailyRow, KpiOptions, Kpis, computeKpis, sumRows } from "../metrics/aggregate";
import { buildLedger, netSalesOf } from "../metrics/accounting";
import { DateRange, DateStr, eachDay, fromDbDate, toDbDate } from "../metrics/dates";
import { paymentFeesForDay, shippingCostForDay } from "../metrics/expenses";
import * as F from "../metrics/formulas";
import { shopifyCoverage } from "../shopify/sync";
import { ensureSettings, loadCostResolver, loadCostSettings, loadFx, loadLedgerOrders } from "../sync/rollup";

const n = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));
const big = (b: bigint | null | undefined) => (b === null || b === undefined ? null : Number(b));

export interface Filters {
  account?: string | null; // Meta ad account externalId (act_…)
  campaign?: string | null;
  adset?: string | null;
  ad?: string | null;
  product?: string | null; // Shopify product externalId
}

export type Scope = "store" | "account" | "entity" | "product";

export interface DailyResult {
  rows: DailyRow[];
  scope: Scope;
  notes: string[];
}

export function kpiOptions(s: { breakEvenMode: "AUTO" | "MANUAL"; manualContributionMargin: Prisma.Decimal | null }): KpiOptions {
  return { breakEvenMode: s.breakEvenMode, manualContributionMargin: n(s.manualContributionMargin) };
}

function emptyRow(date: DateStr): DailyRow {
  return {
    date, hasShopifyData: false, hasMetaData: false, grossSales: null, discounts: null, returns: null, netSales: null,
    shippingCharged: null, taxes: null, totalSales: null, refundedAmount: null, orders: null, cancelledOrders: null,
    refundedOrders: null, unitsSold: null, productCost: null, unitsMissingCost: null, shippingCost: null, paymentFees: null,
    otherExpenses: null, variableExpenses: null, adLinkedExpenses: null, metaSpend: null, metaPurchases: null,
    metaPurchaseValue: null, metaImpressions: null, metaClicks: null, metaLinkClicks: null, metaFxMissing: false,
  };
}

/** Store-wide precomputed daily rows (fast path: one indexed range scan). */
async function storeRows(storeId: string, range: DateRange): Promise<DailyRow[]> {
  const rows = await db.dailyBusinessMetric.findMany({
    where: { storeId, date: { gte: toDbDate(range.from), lte: toDbDate(range.to) } },
    orderBy: { date: "asc" },
  });
  const byDate = new Map(rows.map((r) => [fromDbDate(r.date), r]));
  return eachDay(range.from, range.to).map((d) => {
    const r = byDate.get(d);
    if (!r) return emptyRow(d);
    return {
      date: d,
      hasShopifyData: r.hasShopifyData,
      hasMetaData: r.hasMetaData,
      grossSales: n(r.grossSales), discounts: n(r.discounts), returns: n(r.returns), netSales: n(r.netSales),
      shippingCharged: n(r.shippingCharged), taxes: n(r.taxes), totalSales: n(r.totalSales), refundedAmount: n(r.refundedAmount),
      orders: r.orders, cancelledOrders: r.cancelledOrders, refundedOrders: r.refundedOrders, unitsSold: r.unitsSold,
      productCost: n(r.productCost), unitsMissingCost: r.unitsMissingCost, shippingCost: n(r.shippingCost),
      paymentFees: n(r.paymentFees), otherExpenses: n(r.otherExpenses), variableExpenses: n(r.variableExpenses),
      adLinkedExpenses: n(r.adLinkedExpenses), metaSpend: n(r.metaSpend), metaPurchases: n(r.metaPurchases),
      metaPurchaseValue: n(r.metaPurchaseValue), metaImpressions: big(r.metaImpressions), metaClicks: big(r.metaClicks),
      metaLinkClicks: big(r.metaLinkClicks), metaFxMissing: r.metaFxMissing,
    };
  });
}

/** Meta totals per day at a given level/entity, converted to store currency. */
async function metaRows(
  storeId: string,
  range: DateRange,
  where: Prisma.MetaDailyInsightWhereInput,
  storeCurrency: string,
): Promise<Map<DateStr, { spend: number | null; purchases: number; value: number | null; impressions: number; clicks: number; linkClicks: number; fxMissing: boolean }>> {
  const fx = await loadFx();
  const rows = await db.metaDailyInsight.findMany({
    where: { ...where, adAccount: { storeId }, date: { gte: toDbDate(range.from), lte: toDbDate(range.to) } },
  });
  const out = new Map<DateStr, { spend: number | null; purchases: number; value: number | null; impressions: number; clicks: number; linkClicks: number; fxMissing: boolean }>();
  for (const r of rows) {
    const d = fromDbDate(r.date);
    const m = out.get(d) ?? { spend: 0, purchases: 0, value: 0, impressions: 0, clicks: 0, linkClicks: 0, fxMissing: false };
    const spend = fx.convert(Number(r.spend), r.currency, storeCurrency, d);
    const value = fx.convert(n(r.purchaseValue) ?? 0, r.currency, storeCurrency, d);
    if (spend === null || value === null) m.fxMissing = true;
    m.spend = m.spend === null || spend === null ? null : m.spend + spend;
    m.value = m.value === null || value === null ? null : m.value + value;
    m.purchases += n(r.purchases) ?? 0;
    m.impressions += Number(r.impressions);
    m.clicks += Number(r.clicks);
    m.linkClicks += Number(r.linkClicks ?? 0);
    out.set(d, m);
  }
  return out;
}

/**
 * Daily rows for the dashboard, honouring filters consistently:
 * - no filter       → store-wide precomputed rollup
 * - account filter  → Meta side limited to that ad account; Shopify store-wide
 * - campaign/adset/ad → Meta side for that entity; Shopify side = UTM-attributed orders only;
 *                       fixed overheads are not allocated (campaign contribution)
 * - product filter  → Shopify side for that product; ad spend NOT allocated (null)
 */
export async function loadDailyRows(storeId: string, range: DateRange, filters: Filters = {}): Promise<DailyResult> {
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId }, include: { metaAdAccounts: { where: { isSelected: true } }, shopifyConnection: true } });
  const base = await storeRows(storeId, range);
  const notes: string[] = [];

  if (filters.product) {
    const prows = await db.productDailyMetric.findMany({
      where: { storeId, productExternalId: filters.product, date: { gte: toDbDate(range.from), lte: toDbDate(range.to) } },
    });
    const byDate = new Map(prows.map((p) => [fromDbDate(p.date), p]));
    notes.push("Product filter: sales and product cost are for this product only. Meta ad spend cannot be reliably allocated to individual products, so ad spend, ROAS and net profit are unavailable in this view.");
    return {
      scope: "product",
      notes,
      rows: base.map((r) => {
        const p = byDate.get(r.date);
        const has = r.hasShopifyData;
        return {
          ...emptyRow(r.date),
          hasShopifyData: has,
          hasMetaData: false,
          grossSales: has ? n(p?.grossSales) ?? 0 : null,
          discounts: has ? n(p?.discounts) ?? 0 : null,
          returns: has ? n(p?.returns) ?? 0 : null,
          netSales: has ? n(p?.netSales) ?? 0 : null,
          unitsSold: has ? p?.unitsSold ?? 0 : null,
          productCost: has ? n(p?.productCost) ?? 0 : null,
          unitsMissingCost: has ? p?.unitsMissingCost ?? 0 : null,
        };
      }),
    };
  }

  const entity = filters.ad
    ? { level: "AD" as const, id: filters.ad, orderField: "attributedAdId" as const }
    : filters.adset
      ? { level: "ADSET" as const, id: filters.adset, orderField: "attributedAdSetId" as const }
      : filters.campaign
        ? { level: "CAMPAIGN" as const, id: filters.campaign, orderField: "attributedCampaignId" as const }
        : null;

  if (entity) {
    const meta = await metaRows(storeId, range, { level: entity.level, entityExternalId: entity.id }, store.currency);
    const fx = await loadFx();
    const [{ cost }, costOf, ledgerData] = await Promise.all([
      loadCostSettings(storeId),
      loadCostResolver(storeId, store.currency, fx),
      loadLedgerOrders(storeId, range.from, range.to, store.timezone, { [entity.orderField]: entity.id }),
    ]);
    const ledger = buildLedger(ledgerData.orders, costOf);
    notes.push(
      "Campaign/ad set/ad filter: Meta metrics are for the selected entity. Shopify sales are only the orders whose UTM parameters match it (see Attribution in Definitions). Store overhead expenses are not allocated, so profit here is the contribution after ad spend.",
    );
    return {
      scope: "entity",
      notes,
      rows: base.map((r) => {
        const l = ledger.days.get(r.date);
        const m = meta.get(r.date);
        const hasS = r.hasShopifyData;
        const net = hasS ? (l ? netSalesOf(l) : 0) : null;
        return {
          ...emptyRow(r.date),
          hasShopifyData: hasS,
          hasMetaData: r.hasMetaData,
          grossSales: hasS ? l?.grossSales ?? 0 : null,
          discounts: hasS ? l?.discounts ?? 0 : null,
          returns: hasS ? l?.returns ?? 0 : null,
          netSales: net,
          orders: hasS ? l?.orders ?? 0 : null,
          unitsSold: hasS ? l?.unitsSold ?? 0 : null,
          productCost: hasS ? l?.productCost ?? 0 : null,
          unitsMissingCost: hasS ? l?.unitsMissingCost ?? 0 : null,
          shippingCost: hasS ? shippingCostForDay(cost, { orders: l?.orders ?? 0, shippingCharged: l?.shippingCharged ?? 0, netSales: net ?? 0 }) : null,
          paymentFees: hasS ? paymentFeesForDay(cost, l?.orderTotals ?? 0, l?.feeOrders ?? 0) : null,
          otherExpenses: 0,
          variableExpenses: 0,
          adLinkedExpenses: 0,
          metaSpend: r.hasMetaData ? (m ? m.spend : 0) : null,
          metaPurchases: r.hasMetaData ? m?.purchases ?? 0 : null,
          metaPurchaseValue: r.hasMetaData ? (m ? m.value : 0) : null,
          metaImpressions: r.hasMetaData ? m?.impressions ?? 0 : null,
          metaClicks: r.hasMetaData ? m?.clicks ?? 0 : null,
          metaLinkClicks: r.hasMetaData ? m?.linkClicks ?? 0 : null,
          metaFxMissing: m?.fxMissing ?? false,
        };
      }),
    };
  }

  if (filters.account && store.metaAdAccounts.length > 1) {
    const acct = store.metaAdAccounts.find((a) => a.externalId === filters.account);
    if (acct) {
      const meta = await metaRows(storeId, range, { level: "ACCOUNT", adAccountId: acct.id }, store.currency);
      notes.push(`Meta account filter: Meta metrics are for ${acct.name} only; Shopify sales are store-wide.`);
      return {
        scope: "account",
        notes,
        rows: base.map((r) => {
          const covered = !!acct.insightsFrom && !!acct.insightsThrough && fromDbDate(acct.insightsFrom) <= r.date && r.date <= fromDbDate(acct.insightsThrough);
          const m = meta.get(r.date);
          return {
            ...r,
            hasMetaData: covered,
            metaSpend: covered ? (m ? m.spend : 0) : null,
            metaPurchases: covered ? m?.purchases ?? 0 : null,
            metaPurchaseValue: covered ? (m ? m.value : 0) : null,
            metaImpressions: covered ? m?.impressions ?? 0 : null,
            metaClicks: covered ? m?.clicks ?? 0 : null,
            metaLinkClicks: covered ? m?.linkClicks ?? 0 : null,
            metaFxMissing: m?.fxMissing ?? false,
            // ad-linked expenses scale with total spend; not attributable per account
          };
        }),
      };
    }
  }

  void shopifyCoverage; // coverage is baked into the rollup rows
  return { rows: base, scope: "store", notes };
}

export async function loadPeriod(storeId: string, range: DateRange, filters: Filters = {}): Promise<{ result: DailyResult; kpis: Kpis }> {
  const settings = await ensureSettings(storeId);
  const result = await loadDailyRows(storeId, range, filters);
  return { result, kpis: computeKpis(sumRows(result.rows), kpiOptions(settings)) };
}

// ───────────────────────────── Hourly (order-time) ─────────────────────────────

/**
 * Hourly sales for a single day from order timestamps (reliable: Shopify
 * records exact order times). Refunds are not hourly; Meta spend is not
 * available hourly in this app — it is never fabricated.
 */
export async function loadHourly(storeId: string, date: DateStr) {
  const orders = await db.shopifyOrder.findMany({
    where: { storeId, localDate: toDbDate(date), test: false },
    select: { localHour: true, grossSales: true, totalDiscounts: true, lineItems: { select: { totalDiscount: true, isGiftCard: true } } },
  });
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, grossSales: 0, salesAfterDiscounts: 0 }));
  for (const o of orders) {
    const h = hours[o.localHour];
    const disc = o.lineItems.filter((l) => !l.isGiftCard).reduce((s, l) => s + Number(l.totalDiscount), 0);
    h.orders += 1;
    h.grossSales += Number(o.grossSales);
    h.salesAfterDiscounts += Number(o.grossSales) - disc;
  }
  return hours;
}

// ───────────────────────────── Campaigns ─────────────────────────────

export interface CampaignRow {
  campaignId: string;
  name: string;
  status: string | null;
  accountId: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  ctr: number | null;
  cpc: number | null;
  purchases: number;
  metaRevenue: number | null;
  metaRoas: number | null;
  metaCpa: number | null;
  shopifyOrders: number | null;
  shopifyRevenue: number | null;
  shopifyRoas: number | null;
  cpa: number | null;
  netProfit: number | null;
  profitMargin: number | null;
  unitsMissingCost: number;
  fxMissing: boolean;
}

export async function loadCampaigns(storeId: string, range: DateRange, filters: Filters = {}): Promise<{ rows: CampaignRow[]; attributionAvailable: boolean }> {
  const { cost } = await loadCostSettings(storeId);
  const agg = await db.campaignDailyMetric.groupBy({
    by: ["campaignExternalId"],
    where: {
      storeId,
      date: { gte: toDbDate(range.from), lte: toDbDate(range.to) },
      ...(filters.account ? { adAccountExternalId: filters.account } : {}),
      ...(filters.campaign ? { campaignExternalId: filters.campaign } : {}),
    },
    _sum: {
      spend: true, impressions: true, clicks: true, linkClicks: true, purchases: true, purchaseValue: true,
      shopifyOrders: true, shopifyNetSales: true, shopifyProductCost: true, shopifyUnitsMissingCost: true,
    },
  });
  const fxMissing = await db.campaignDailyMetric.findMany({
    where: { storeId, fxMissing: true, date: { gte: toDbDate(range.from), lte: toDbDate(range.to) } },
    select: { campaignExternalId: true },
    distinct: ["campaignExternalId"],
  });
  const fxSet = new Set(fxMissing.map((f) => f.campaignExternalId));
  const campaigns = await db.metaCampaign.findMany({
    where: { externalId: { in: agg.map((a) => a.campaignExternalId) }, adAccount: { storeId } },
    include: { adAccount: { select: { externalId: true } } },
  });
  const meta = new Map(campaigns.map((c) => [c.externalId, c]));
  const attributedCount = await db.shopifyOrder.count({ where: { storeId, attributedCampaignId: { not: null } } });
  const attributionAvailable = attributedCount > 0;

  const rows = agg.map<CampaignRow>((a) => {
    const c = meta.get(a.campaignExternalId);
    const spend = n(a._sum.spend) ?? 0;
    const impressions = big(a._sum.impressions) ?? 0;
    const clicks = big(a._sum.clicks) ?? 0;
    const linkClicks = big(a._sum.linkClicks) ?? 0;
    const purchases = n(a._sum.purchases) ?? 0;
    // Missing FX rate: spend for some days could not be converted — ratios are withheld.
    const fx = fxSet.has(a.campaignExternalId);
    const metaRevenue = fx ? null : n(a._sum.purchaseValue) ?? 0;
    const orders = attributionAvailable ? a._sum.shopifyOrders ?? 0 : null;
    const revenue = attributionAvailable ? n(a._sum.shopifyNetSales) ?? 0 : null;
    const productCost = n(a._sum.shopifyProductCost) ?? 0;
    // Campaign contribution: attributed net sales − product cost − ad spend − modelled variable costs.
    const variable =
      revenue === null || orders === null
        ? null
        : shippingCostForDay(cost, { orders, shippingCharged: 0, netSales: revenue }) + paymentFeesForDay(cost, revenue, orders);
    const profit = revenue === null || variable === null || fx ? null : revenue - productCost - spend - variable;
    return {
      campaignId: a.campaignExternalId,
      name: c?.name ?? `Campaign ${a.campaignExternalId}`,
      status: c?.effectiveStatus ?? c?.status ?? null,
      accountId: c?.adAccount.externalId ?? "",
      spend,
      impressions,
      clicks,
      linkClicks,
      ctr: F.ctr(linkClicks || clicks, impressions),
      cpc: F.cpc(spend, linkClicks || clicks),
      purchases,
      metaRevenue,
      metaRoas: fx ? null : F.metaRoas(metaRevenue, spend),
      metaCpa: fx ? null : F.metaCpa(spend, purchases),
      shopifyOrders: orders,
      shopifyRevenue: revenue,
      shopifyRoas: fx ? null : F.shopifyRoas(revenue, spend),
      cpa: fx ? null : F.cpa(spend, orders),
      netProfit: profit,
      profitMargin: F.profitMargin(profit, revenue),
      unitsMissingCost: a._sum.shopifyUnitsMissingCost ?? 0,
      fxMissing: fx,
    };
  });
  return { rows: rows.sort((x, y) => y.spend - x.spend), attributionAvailable };
}

/** Meta ad set / ad performance (Meta-reported only). */
export async function loadMetaEntities(storeId: string, range: DateRange, level: "ADSET" | "AD", filters: Filters = {}) {
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId } });
  const fx = await loadFx();
  const rows = await db.metaDailyInsight.findMany({
    where: {
      adAccount: { storeId, isSelected: true, ...(filters.account ? { externalId: filters.account } : {}) },
      level,
      date: { gte: toDbDate(range.from), lte: toDbDate(range.to) },
      ...(filters.campaign ? { campaignExternalId: filters.campaign } : {}),
      ...(filters.adset ? { adSetExternalId: filters.adset } : {}),
    },
  });
  const agg = new Map<string, { id: string; campaignId: string | null; spend: number | null; impressions: number; clicks: number; linkClicks: number; purchases: number; value: number | null }>();
  for (const r of rows) {
    const d = fromDbDate(r.date);
    const a = agg.get(r.entityExternalId) ?? { id: r.entityExternalId, campaignId: r.campaignExternalId, spend: 0, impressions: 0, clicks: 0, linkClicks: 0, purchases: 0, value: 0 };
    const s = fx.convert(Number(r.spend), r.currency, store.currency, d);
    const v = fx.convert(n(r.purchaseValue) ?? 0, r.currency, store.currency, d);
    a.spend = a.spend === null || s === null ? null : a.spend + s;
    a.value = a.value === null || v === null ? null : a.value + v;
    a.impressions += Number(r.impressions);
    a.clicks += Number(r.clicks);
    a.linkClicks += Number(r.linkClicks ?? 0);
    a.purchases += n(r.purchases) ?? 0;
    agg.set(r.entityExternalId, a);
  }
  const ids = [...agg.keys()];
  const names =
    level === "ADSET"
      ? await db.metaAdSet.findMany({ where: { externalId: { in: ids } }, select: { externalId: true, name: true, effectiveStatus: true } })
      : await db.metaAd.findMany({ where: { externalId: { in: ids } }, select: { externalId: true, name: true, effectiveStatus: true } });
  const nameMap = new Map(names.map((x) => [x.externalId, x]));
  return [...agg.values()]
    .map((a) => ({
      ...a,
      name: nameMap.get(a.id)?.name ?? a.id,
      status: nameMap.get(a.id)?.effectiveStatus ?? null,
      ctr: F.ctr(a.linkClicks || a.clicks, a.impressions),
      cpc: F.cpc(a.spend, a.linkClicks || a.clicks),
      cpm: F.cpm(a.spend, a.impressions),
      metaRoas: F.metaRoas(a.value, a.spend),
      metaCpa: F.metaCpa(a.spend, a.purchases),
    }))
    .sort((x, y) => (y.spend ?? 0) - (x.spend ?? 0));
}

// ───────────────────────────── Products ─────────────────────────────

export async function loadProducts(storeId: string, range: DateRange) {
  const agg = await db.productDailyMetric.groupBy({
    by: ["productExternalId"],
    where: { storeId, date: { gte: toDbDate(range.from), lte: toDbDate(range.to) } },
    _sum: { unitsSold: true, unitsReturned: true, grossSales: true, discounts: true, returns: true, netSales: true, productCost: true, unitsMissingCost: true },
  });
  const titles = await db.productDailyMetric.findMany({
    where: { storeId, productExternalId: { in: agg.map((a) => a.productExternalId) } },
    distinct: ["productExternalId"],
    select: { productExternalId: true, title: true },
    orderBy: { date: "desc" },
  });
  const products = await db.shopifyProduct.findMany({ where: { storeId, externalId: { in: agg.map((a) => a.productExternalId) } }, select: { externalId: true, title: true } });
  const t = new Map([...titles.map((x) => [x.productExternalId, x.title] as const), ...products.map((p) => [p.externalId, p.title] as const)]);
  return agg
    .map((a) => {
      const net = n(a._sum.netSales) ?? 0;
      const costv = n(a._sum.productCost) ?? 0;
      const missing = a._sum.unitsMissingCost ?? 0;
      const profit = net - costv;
      return {
        productId: a.productExternalId,
        title: t.get(a.productExternalId) ?? a.productExternalId,
        unitsSold: a._sum.unitsSold ?? 0,
        unitsReturned: a._sum.unitsReturned ?? 0,
        grossSales: n(a._sum.grossSales) ?? 0,
        discounts: n(a._sum.discounts) ?? 0,
        returns: n(a._sum.returns) ?? 0,
        netSales: net,
        productCost: costv,
        unitsMissingCost: missing,
        /** Gross profit (before ads & overhead). */
        grossProfit: profit,
        margin: F.profitMargin(profit, net),
      };
    })
    .sort((x, y) => y.netSales - x.netSales);
}

// ───────────────────────────── Freshness ─────────────────────────────

export async function loadFreshness(storeId: string) {
  const [shop, meta, accounts, lastRollup] = await Promise.all([
    db.shopifyConnection.findUnique({ where: { storeId } }),
    db.metaConnection.findUnique({ where: { storeId } }),
    db.metaAdAccount.findMany({ where: { storeId, isSelected: true }, select: { name: true, insightsThrough: true, lastInsightsSyncAt: true, currency: true, timezone: true } }),
    db.syncLog.findFirst({ where: { storeId, platform: "SYSTEM", syncType: "rollup", status: "COMPLETED" }, orderBy: { completedAt: "desc" } }),
  ]);
  return {
    shopify: shop && shop.status !== "DISCONNECTED"
      ? {
          status: shop.status,
          lastSyncAt: shop.lastSyncAt,
          lastSuccessfulSyncAt: shop.lastSuccessfulSyncAt,
          lastError: shop.lastError,
          initialImportComplete: !!shop.initialImportCompletedAt,
          webhooks: !!shop.webhooksRegisteredAt,
        }
      : null,
    meta: meta && meta.status !== "DISCONNECTED"
      ? {
          status: meta.status,
          lastSyncAt: meta.lastSyncAt,
          lastSuccessfulSyncAt: meta.lastSuccessfulSyncAt,
          lastError: meta.lastError,
          tokenExpiresAt: meta.tokenExpiresAt,
          accounts,
        }
      : null,
    computedAt: lastRollup?.completedAt ?? null,
  };
}
export type Freshness = Awaited<ReturnType<typeof loadFreshness>>;
