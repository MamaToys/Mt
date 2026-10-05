import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { CostResolver, LedgerOrder, buildLedger } from "../metrics/accounting";
import { FxTable } from "../metrics/currency";
import { DateStr, addDays, eachDay, fromDbDate, localDateOf, toDbDate, todayIn, minDate } from "../metrics/dates";
import { CostSettings, ExpenseDef } from "../metrics/expenses";
import { MetaDay, rollupDays } from "../metrics/rollup";
import { attributeOrder, buildLookup } from "../shopify/attribution";
import { shopifyCoverage } from "../shopify/sync";
import { startSyncLog } from "./log";

const n = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));
const D = (v: number | null) => (v === null ? null : new Prisma.Decimal(v.toFixed(4)));
const B = (v: number | null) => (v === null ? null : BigInt(Math.round(v)));

export async function loadCostSettings(storeId: string): Promise<{ cost: CostSettings; s: Awaited<ReturnType<typeof ensureSettings>> }> {
  const s = await ensureSettings(storeId);
  return {
    s,
    cost: {
      paymentFeePercent: Number(s.paymentFeePercent),
      paymentFeeFixed: Number(s.paymentFeeFixed),
      shippingCostMode: s.shippingCostMode,
      shippingCostPerOrder: Number(s.shippingCostPerOrder),
      shippingCostPercent: Number(s.shippingCostPercent),
    },
  };
}

export async function ensureSettings(storeId: string) {
  return db.storeSettings.upsert({ where: { storeId }, create: { storeId }, update: {} });
}

export async function loadExpenses(storeId: string, storeCurrency?: string, fx?: FxTable): Promise<ExpenseDef[]> {
  const rows = await db.expense.findMany({ where: { storeId } });
  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    category: e.category,
    type: e.type,
    frequency: e.frequency,
    // Fixed amounts in another currency are converted at the start-date rate; no rate → unavailable.
    amount: storeCurrency && fx && e.currency !== storeCurrency ? fx.convert(n(e.amount), e.currency, storeCurrency, fromDbDate(e.startDate)) : n(e.amount),
    percent: n(e.percent),
    percentBase: e.percentBase,
    startDate: fromDbDate(e.startDate),
    endDate: e.endDate ? fromDbDate(e.endDate) : null,
  }));
}

export async function loadFx(storeId: string): Promise<FxTable> {
  const rates = await db.exchangeRate.findMany({ where: { storeId } });
  return new FxTable(rates.map((r) => ({ base: r.base, quote: r.quote, date: fromDbDate(r.date), rate: Number(r.rate) })));
}

/**
 * Cost resolver: MANUAL cost (latest effectiveFrom ≤ sale date) overrides the
 * Shopify "cost per item"; then the cost snapshot on the line item; else null
 * (= missing, flagged — never assumed to be zero).
 */
export async function loadCostResolver(storeId: string, storeCurrency: string, fx: FxTable): Promise<CostResolver> {
  const costs = await db.productCost.findMany({ where: { storeId }, orderBy: { effectiveFrom: "desc" } });
  const byVariant = new Map<string, typeof costs>();
  const bySku = new Map<string, typeof costs>();
  for (const c of costs) {
    if (c.variantExternalId) byVariant.set(c.variantExternalId, [...(byVariant.get(c.variantExternalId) ?? []), c]);
    if (c.sku) bySku.set(c.sku.toLowerCase(), [...(bySku.get(c.sku.toLowerCase()) ?? []), c]);
  }
  const pick = (list: typeof costs | undefined, date: DateStr) => {
    if (!list) return null;
    const ok = list.filter((c) => fromDbDate(c.effectiveFrom) <= date);
    const manual = ok.find((c) => c.source === "MANUAL");
    const chosen = manual ?? ok.find((c) => c.source === "SHOPIFY");
    if (!chosen) return null;
    return fx.convert(Number(chosen.costPerUnit), chosen.currency, storeCurrency, date);
  };
  return (line, date) => {
    const v = line.variantExternalId ? pick(byVariant.get(line.variantExternalId), date) : null;
    if (v !== null) return v;
    const s = line.sku ? pick(bySku.get(line.sku.toLowerCase()), date) : null;
    if (s !== null) return s;
    return line.shopifyUnitCost;
  };
}

/** Loads orders that touch [from, to] via order date, refund date or cancellation. */
export async function loadLedgerOrders(storeId: string, from: DateStr, to: DateStr, timeZone: string, extraWhere: Prisma.ShopifyOrderWhereInput = {}): Promise<{ orders: LedgerOrder[]; raw: { utmSource: string | null; utmCampaign: string | null; utmTerm: string | null; utmContent: string | null; externalId: string; attributedCampaignId: string | null; attributedAdSetId: string | null; attributedAdId: string | null }[] }> {
  const start = toDbDate(from);
  const end = toDbDate(to);
  // Cancellation is stored as a timestamp; widen by a day on each side then filter by local date.
  const rows = await db.shopifyOrder.findMany({
    where: {
      storeId,
      ...extraWhere,
      OR: [
        { localDate: { gte: start, lte: end } },
        { refunds: { some: { localDate: { gte: start, lte: end } } } },
        { cancelledAt: { gte: new Date(start.getTime() - 86_400_000), lt: new Date(end.getTime() + 2 * 86_400_000) } },
      ],
    },
    include: { lineItems: true, refunds: { include: { lineItems: true } } },
  });
  const orders = rows.map<LedgerOrder>((o) => ({
    externalId: o.externalId,
    localDate: fromDbDate(o.localDate),
    test: o.test,
    financialStatus: o.financialStatus,
    cancelledLocalDate: o.cancelledAt ? localDateOf(o.cancelledAt, timeZone) : null,
    totalPrice: Number(o.totalPrice),
    totalShipping: Number(o.totalShipping),
    totalTax: Number(o.totalTax),
    attributedCampaignId: null,
    lines: o.lineItems.map((l) => ({
      id: l.id,
      productExternalId: l.productExternalId,
      variantExternalId: l.variantExternalId,
      sku: l.sku,
      title: l.title,
      quantity: l.quantity,
      originalUnitPrice: Number(l.originalUnitPrice),
      totalDiscount: Number(l.totalDiscount),
      shopifyUnitCost: n(l.shopifyUnitCost),
      isGiftCard: l.isGiftCard,
    })),
    refunds: o.refunds.map((r) => ({
      localDate: fromDbDate(r.localDate),
      totalRefunded: Number(r.totalRefunded),
      shippingRefunded: Number(r.shippingRefunded),
      lines: r.lineItems.map((rl) => ({
        lineItemId: rl.lineItemId,
        quantity: rl.quantity,
        subtotal: Number(rl.subtotal),
        totalTax: Number(rl.totalTax),
        restockType: rl.restockType,
      })),
    })),
  }));
  return { orders, raw: rows };
}

/**
 * Recomputes DailyBusinessMetric, CampaignDailyMetric and ProductDailyMetric
 * for every store-local date in [from, to]. Idempotent: rows in the range are
 * replaced, so the rollup can be re-run any number of times.
 */
export async function rebuildRollups(storeId: string, from: DateStr, to: DateStr, trigger = "sync"): Promise<number> {
  const store = await db.store.findUniqueOrThrow({
    where: { id: storeId },
    include: { shopifyConnection: true, metaAdAccounts: { where: { isSelected: true } } },
  });
  const tz = store.timezone;
  const today = todayIn(tz);
  to = minDate(to, today);
  if (from > to) return 0;
  const log = await startSyncLog(storeId, "SYSTEM", "rollup", trigger);
  try {
    const dates = eachDay(from, to);
    const fx = await loadFx(storeId);
    const [{ cost, s }, expenses, costOf, ledgerData] = await Promise.all([
      loadCostSettings(storeId),
      loadExpenses(storeId, store.currency, fx),
      loadCostResolver(storeId, store.currency, fx),
      loadLedgerOrders(storeId, from, to, tz),
    ]);

    // Attribution lookup from known Meta structure.
    const accountIds = store.metaAdAccounts.map((a) => a.id);
    const [campaigns, adsets, ads] = await Promise.all([
      db.metaCampaign.findMany({ where: { adAccountId: { in: accountIds } }, select: { externalId: true, name: true, adAccountId: true, adAccount: { select: { externalId: true } } } }),
      db.metaAdSet.findMany({ where: { adAccountId: { in: accountIds } }, select: { externalId: true } }),
      db.metaAd.findMany({ where: { adAccountId: { in: accountIds } }, select: { externalId: true } }),
    ]);
    if (s.utmAttributionEnabled) {
      const lookup = buildLookup(campaigns, adsets.map((a) => a.externalId), ads.map((a) => a.externalId));
      // Persist attribution changes for drill-down filters, batched by target value.
      const groups = new Map<string, { a: { campaignId: string | null; adSetId: string | null; adId: string | null }; ids: string[] }>();
      ledgerData.orders.forEach((o, i) => {
        const raw = ledgerData.raw[i];
        const a = attributeOrder(raw, lookup);
        o.attributedCampaignId = a.campaignId;
        if (raw.attributedCampaignId === a.campaignId && raw.attributedAdSetId === a.adSetId && raw.attributedAdId === a.adId) return;
        const key = `${a.campaignId}|${a.adSetId}|${a.adId}`;
        const g = groups.get(key) ?? { a, ids: [] };
        g.ids.push(o.externalId);
        groups.set(key, g);
      });
      for (const { a, ids } of groups.values()) {
        for (let i = 0; i < ids.length; i += 5000) {
          await db.shopifyOrder.updateMany({
            where: { storeId, externalId: { in: ids.slice(i, i + 5000) } },
            data: { attributedCampaignId: a.campaignId, attributedAdSetId: a.adSetId, attributedAdId: a.adId },
          });
        }
      }
    }

    if (!s.utmAttributionEnabled) {
      await db.shopifyOrder.updateMany({
        where: { storeId, attributedCampaignId: { not: null } },
        data: { attributedCampaignId: null, attributedAdSetId: null, attributedAdId: null },
      });
    }

    const ledger = buildLedger(ledgerData.orders, costOf);
    const cov = shopifyCoverage(store.shopifyConnection, tz);

    // Meta account-level daily totals, converted to store currency.
    const accountInsights = await db.metaDailyInsight.findMany({
      where: { adAccountId: { in: accountIds }, level: "ACCOUNT", date: { gte: toDbDate(from), lte: toDbDate(to) } },
    });
    const metaDays = new Map<DateStr, MetaDay>();
    for (const r of accountInsights) {
      const d = fromDbDate(r.date);
      const m = metaDays.get(d) ?? { spend: 0, purchases: 0, purchaseValue: 0, impressions: 0, clicks: 0, linkClicks: 0, fxMissing: false };
      const spend = fx.convert(Number(r.spend), r.currency, store.currency, d);
      const value = fx.convert(n(r.purchaseValue) ?? 0, r.currency, store.currency, d);
      if (spend === null || value === null) m.fxMissing = true;
      m.spend = m.spend === null || spend === null ? null : m.spend + spend;
      m.purchaseValue = m.purchaseValue === null || value === null ? null : m.purchaseValue + value;
      m.purchases += n(r.purchases) ?? 0;
      m.impressions += Number(r.impressions);
      m.clicks += Number(r.clicks);
      m.linkClicks += Number(r.linkClicks ?? 0);
      metaDays.set(d, m);
    }
    const metaCovered = (d: DateStr) =>
      store.metaAdAccounts.length > 0 &&
      store.metaAdAccounts.every((a) => a.insightsFrom && a.insightsThrough && fromDbDate(a.insightsFrom) <= d && d <= fromDbDate(a.insightsThrough));

    const rows = rollupDays({
      dates,
      ledgerDays: ledger.days,
      hasShopifyData: (d) => !!cov && cov.from <= d && d <= cov.to,
      metaDays,
      hasMetaData: metaCovered,
      expenses,
      costSettings: cost,
    });

    // Campaign-level rows.
    const campaignInsights = await db.metaDailyInsight.findMany({
      where: { adAccountId: { in: accountIds }, level: "CAMPAIGN", date: { gte: toDbDate(from), lte: toDbDate(to) } },
      include: { adAccount: { select: { externalId: true } } },
    });
    type CRow = Prisma.CampaignDailyMetricCreateManyInput;
    const campaignRows = new Map<string, CRow>();
    for (const r of campaignInsights) {
      const d = fromDbDate(r.date);
      const spend = fx.convert(Number(r.spend), r.currency, store.currency, d);
      const value = fx.convert(n(r.purchaseValue) ?? 0, r.currency, store.currency, d);
      campaignRows.set(`${d}|${r.entityExternalId}`, {
        storeId,
        adAccountExternalId: r.adAccount.externalId,
        campaignExternalId: r.entityExternalId,
        date: r.date,
        spend: D(spend ?? 0)!,
        impressions: r.impressions,
        clicks: r.clicks,
        linkClicks: r.linkClicks,
        purchases: r.purchases,
        purchaseValue: D(value),
        fxMissing: spend === null || value === null,
      });
    }
    const campaignAccount = new Map(campaigns.map((c) => [c.externalId, c.adAccount.externalId]));
    const covered = (d: DateStr) => !!cov && cov.from <= d && d <= cov.to;
    for (const [k, v] of ledger.campaigns) {
      const [d, campaignId] = k.split("|");
      if (d < from || d > to || !covered(d)) continue; // incomplete Shopify days are never reported as complete
      const row = campaignRows.get(k) ?? {
        storeId, adAccountExternalId: campaignAccount.get(campaignId) ?? "", campaignExternalId: campaignId, date: toDbDate(d),
        spend: new Prisma.Decimal(0), impressions: BigInt(0), clicks: BigInt(0), linkClicks: null, purchases: null, purchaseValue: null, fxMissing: false,
      };
      row.shopifyOrders = v.orders;
      row.shopifyNetSales = D(v.netSales)!;
      row.shopifyProductCost = D(v.productCost)!;
      row.shopifyUnitsMissingCost = v.unitsMissingCost;
      row.shopifyOrderTotals = D(v.orderTotals)!;
      row.shopifyShippingCharged = D(v.shippingCharged)!;
      row.shopifyFeeOrders = v.feeOrders;
      campaignRows.set(k, row);
    }

    const productRows: Prisma.ProductDailyMetricCreateManyInput[] = [];
    for (const [k, p] of ledger.products) {
      const d = k.split("|")[0];
      if (d < from || d > to || !covered(d)) continue;
      productRows.push({
        storeId, productExternalId: p.productExternalId, title: p.title, date: toDbDate(d),
        unitsSold: p.unitsSold, unitsReturned: p.unitsReturned, grossSales: D(p.grossSales)!, discounts: D(p.discounts)!,
        returns: D(p.returns)!, netSales: D(p.grossSales - p.discounts - p.returns)!, productCost: D(p.productCost)!,
        unitsMissingCost: p.unitsMissingCost,
      });
    }

    const range = { gte: toDbDate(from), lte: toDbDate(to) };
    await db.$transaction(async (tx) => {
      await tx.dailyBusinessMetric.deleteMany({ where: { storeId, date: range } });
      await tx.dailyBusinessMetric.createMany({
        data: rows.map((r) => ({
          storeId,
          date: toDbDate(r.date),
          hasShopifyData: r.hasShopifyData,
          hasMetaData: r.hasMetaData,
          grossSales: D(r.grossSales), discounts: D(r.discounts), returns: D(r.returns), netSales: D(r.netSales),
          shippingCharged: D(r.shippingCharged), taxes: D(r.taxes), totalSales: D(r.totalSales), refundedAmount: D(r.refundedAmount),
          orders: r.orders, cancelledOrders: r.cancelledOrders, refundedOrders: r.refundedOrders, unitsSold: r.unitsSold,
          productCost: D(r.productCost), unitsMissingCost: r.unitsMissingCost, shippingCost: D(r.shippingCost),
          paymentFees: D(r.paymentFees), otherExpenses: D(r.otherExpenses), variableExpenses: D(r.variableExpenses),
          adLinkedExpenses: D(r.adLinkedExpenses),
          metaSpend: D(r.metaSpend), metaPurchases: D(r.metaPurchases), metaPurchaseValue: D(r.metaPurchaseValue),
          metaImpressions: B(r.metaImpressions), metaClicks: B(r.metaClicks), metaLinkClicks: B(r.metaLinkClicks),
          metaFxMissing: r.metaFxMissing,
          computedAt: new Date(),
        })),
      });
      await tx.campaignDailyMetric.deleteMany({ where: { storeId, date: range } });
      if (campaignRows.size) await tx.campaignDailyMetric.createMany({ data: [...campaignRows.values()] });
      await tx.productDailyMetric.deleteMany({ where: { storeId, date: range } });
      if (productRows.length) await tx.productDailyMetric.createMany({ data: productRows });
    }, { timeout: 120_000 });

    log.add(rows.length);
    log.detail("range", { from, to });
    await log.finish();
    return rows.length;
  } catch (e) {
    await log.fail(e);
    throw e;
  }
}

/** Rebuilds the rollup for a set of affected dates (as one contiguous range). */
export async function rebuildForDates(storeId: string, dates: Iterable<string>, trigger = "sync"): Promise<number> {
  const list = [...dates].sort();
  if (list.length === 0) return 0;
  return rebuildChunked(storeId, list[0], list[list.length - 1], trigger);
}

/** Splits long ranges into ~quarterly windows to bound memory (each window is independent and idempotent). */
export async function rebuildChunked(storeId: string, from: DateStr, to: DateStr, trigger: string, windowDays = 92): Promise<number> {
  let n = 0;
  for (let start = from; start <= to; start = addDays(start, windowDays)) {
    const end = addDays(start, windowDays - 1);
    n += await rebuildRollups(storeId, start, end < to ? end : to, trigger);
  }
  return n;
}

/** Full rebuild across the store's entire data coverage (e.g. after settings or cost changes). */
export async function rebuildAll(storeId: string, trigger = "settings"): Promise<number> {
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId }, include: { shopifyConnection: true, metaAdAccounts: true } });
  const candidates: string[] = [];
  if (store.shopifyConnection?.historyFrom) candidates.push(fromDbDate(store.shopifyConnection.historyFrom));
  for (const a of store.metaAdAccounts) if (a.insightsFrom) candidates.push(fromDbDate(a.insightsFrom));
  const firstOrder = await db.shopifyOrder.findFirst({ where: { storeId }, orderBy: { localDate: "asc" }, select: { localDate: true } });
  if (firstOrder) candidates.push(fromDbDate(firstOrder.localDate));
  const today = todayIn(store.timezone);
  const from = candidates.length ? candidates.sort()[0] : addDays(today, -30);
  return rebuildChunked(storeId, from, today, trigger);
}
