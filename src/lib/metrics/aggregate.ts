/**
 * Aggregation of precomputed daily rows into period totals, derived KPIs and
 * day/week/month buckets. Sums are STRICT: if any day in a period lacks a value
 * (null = data unavailable), the period total is null and coverage counters
 * say how many days were missing. Missing data is never summed as zero.
 */
import { DateStr, Granularity, bucketKey } from "./dates";
import * as F from "./formulas";

export interface DailyRow {
  date: DateStr;
  hasShopifyData: boolean;
  hasMetaData: boolean;
  grossSales: number | null;
  discounts: number | null;
  returns: number | null;
  netSales: number | null;
  shippingCharged: number | null;
  taxes: number | null;
  totalSales: number | null;
  refundedAmount: number | null;
  orders: number | null;
  cancelledOrders: number | null;
  refundedOrders: number | null;
  unitsSold: number | null;
  productCost: number | null;
  unitsMissingCost: number | null;
  shippingCost: number | null;
  paymentFees: number | null;
  otherExpenses: number | null;
  variableExpenses: number | null;
  adLinkedExpenses: number | null;
  metaSpend: number | null;
  metaPurchases: number | null;
  metaPurchaseValue: number | null;
  metaImpressions: number | null;
  metaClicks: number | null;
  metaLinkClicks: number | null;
  metaFxMissing: boolean;
}

export const SUM_FIELDS = [
  "grossSales", "discounts", "returns", "netSales", "shippingCharged", "taxes", "totalSales",
  "refundedAmount", "orders", "cancelledOrders", "refundedOrders", "unitsSold", "productCost",
  "unitsMissingCost", "shippingCost", "paymentFees", "otherExpenses", "variableExpenses",
  "adLinkedExpenses", "metaSpend", "metaPurchases", "metaPurchaseValue", "metaImpressions",
  "metaClicks", "metaLinkClicks",
] as const;
export type SumField = (typeof SUM_FIELDS)[number];

export type Totals = Record<SumField, number | null> & {
  days: number;
  daysWithShopify: number;
  daysWithMeta: number;
  metaFxMissing: boolean;
};

export function sumRows(rows: DailyRow[]): Totals {
  const t = { days: rows.length, daysWithShopify: 0, daysWithMeta: 0, metaFxMissing: false } as Totals;
  for (const f of SUM_FIELDS) t[f] = rows.length === 0 ? null : 0;
  for (const r of rows) {
    if (r.hasShopifyData) t.daysWithShopify++;
    if (r.hasMetaData) t.daysWithMeta++;
    if (r.metaFxMissing) t.metaFxMissing = true;
    for (const f of SUM_FIELDS) {
      const v = r[f];
      t[f] = t[f] === null || v === null ? null : (t[f] as number) + v;
    }
  }
  return t;
}

export interface KpiOptions {
  breakEvenMode: "AUTO" | "MANUAL";
  manualContributionMargin: number | null; // 0–1
}

export interface Kpis {
  grossSales: number | null;
  discounts: number | null;
  returns: number | null;
  netSales: number | null;
  shippingCharged: number | null;
  taxes: number | null;
  totalSales: number | null;
  refundedAmount: number | null;
  orders: number | null;
  unitsSold: number | null;
  productCost: number | null;
  productCostComplete: boolean;
  unitsMissingCost: number | null;
  shippingCost: number | null;
  paymentFees: number | null;
  otherExpenses: number | null;
  metaSpend: number | null;
  metaPurchases: number | null;
  metaPurchaseValue: number | null;
  metaImpressions: number | null;
  metaClicks: number | null;
  metaLinkClicks: number | null;
  aov: number | null;
  shopifyRoas: number | null;
  metaRoas: number | null;
  profitRoas: number | null;
  cpa: number | null;
  metaCpa: number | null;
  netProfit: number | null;
  profitMargin: number | null;
  adSpendPct: number | null;
  contributionMargin: number | null;
  contributionMarginSource: "AUTO" | "MANUAL";
  adOverheadRate: number;
  breakEvenRoas: number | null;
  breakEvenStatus: F.BreakEvenStatus;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  refundRate: number | null;
  /** Explanations for any metric that could not be computed. */
  gaps: string[];
}

export function computeKpis(t: Totals, opts: KpiOptions): Kpis {
  const gaps: string[] = [];
  if (t.days > 0 && t.daysWithShopify < t.days)
    gaps.push(`Shopify data unavailable for ${t.days - t.daysWithShopify} of ${t.days} day(s).`);
  if (t.days > 0 && t.daysWithMeta < t.days)
    gaps.push(`Meta data unavailable for ${t.days - t.daysWithMeta} of ${t.days} day(s).`);
  if (t.metaFxMissing) gaps.push("Some Meta spend could not be converted to the store currency (missing exchange rate).");
  if ((t.unitsMissingCost ?? 0) > 0)
    gaps.push(`${t.unitsMissingCost} unit(s) sold have no product cost — profit excludes their cost.`);

  const netProfit = F.netProfit({
    netSales: t.netSales,
    productCost: t.productCost,
    metaSpend: t.metaSpend,
    shippingCost: t.shippingCost,
    paymentFees: t.paymentFees,
    otherExpenses: t.otherExpenses,
  });

  const autoCm = F.contributionMargin({
    netSales: t.netSales,
    productCost: t.productCost,
    shippingCost: t.shippingCost,
    paymentFees: t.paymentFees,
    variableExpenses: t.variableExpenses,
  });
  const cm = opts.breakEvenMode === "MANUAL" ? opts.manualContributionMargin : autoCm;
  const adOverheadRate = F.safeDiv(t.adLinkedExpenses, t.metaSpend) ?? 0;
  const breakEven = F.breakEvenRoas(cm, adOverheadRate);
  const sRoas = F.shopifyRoas(t.netSales, t.metaSpend);

  return {
    grossSales: t.grossSales,
    discounts: t.discounts,
    returns: t.returns,
    netSales: t.netSales,
    shippingCharged: t.shippingCharged,
    taxes: t.taxes,
    totalSales: t.totalSales,
    refundedAmount: t.refundedAmount,
    orders: t.orders,
    unitsSold: t.unitsSold,
    productCost: t.productCost,
    productCostComplete: (t.unitsMissingCost ?? 0) <= 0,
    unitsMissingCost: t.unitsMissingCost,
    shippingCost: t.shippingCost,
    paymentFees: t.paymentFees,
    otherExpenses: t.otherExpenses,
    metaSpend: t.metaSpend,
    metaPurchases: t.metaPurchases,
    metaPurchaseValue: t.metaPurchaseValue,
    metaImpressions: t.metaImpressions,
    metaClicks: t.metaClicks,
    metaLinkClicks: t.metaLinkClicks,
    aov: F.aov(t.netSales, t.orders),
    shopifyRoas: sRoas,
    metaRoas: F.metaRoas(t.metaPurchaseValue, t.metaSpend),
    profitRoas: F.profitRoas(netProfit, t.metaSpend),
    cpa: F.cpa(t.metaSpend, t.orders),
    metaCpa: F.metaCpa(t.metaSpend, t.metaPurchases),
    netProfit,
    profitMargin: F.profitMargin(netProfit, t.netSales),
    adSpendPct: F.adSpendPct(t.metaSpend, t.netSales),
    contributionMargin: cm,
    contributionMarginSource: opts.breakEvenMode,
    adOverheadRate,
    breakEvenRoas: breakEven,
    breakEvenStatus: F.breakEvenStatus(sRoas, breakEven),
    ctr: F.ctr(t.metaLinkClicks ?? t.metaClicks, t.metaImpressions),
    cpc: F.cpc(t.metaSpend, t.metaLinkClicks ?? t.metaClicks),
    cpm: F.cpm(t.metaSpend, t.metaImpressions),
    refundRate:
      t.returns === null || t.grossSales === null || t.discounts === null
        ? null
        : F.pct(t.returns, t.grossSales - t.discounts),
    gaps,
  };
}

export interface Bucket {
  key: DateStr; // first day of bucket
  from: DateStr;
  to: DateStr;
  totals: Totals;
  kpis: Kpis;
}

export function bucketRows(
  rows: DailyRow[],
  granularity: Exclude<Granularity, "hour">,
  opts: KpiOptions,
  weekStartsOn = 1,
): Bucket[] {
  const groups = new Map<DateStr, DailyRow[]>();
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const k = bucketKey(r.date, granularity, weekStartsOn);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.entries()].map(([key, rs]) => {
    const totals = sumRows(rs);
    return { key, from: rs[0].date, to: rs[rs.length - 1].date, totals, kpis: computeKpis(totals, opts) };
  });
}

export type KpiKey = keyof Omit<Kpis, "gaps" | "productCostComplete" | "contributionMarginSource" | "breakEvenStatus">;

/** Percentage changes current vs previous for the given KPI keys. */
export function kpiChanges<K extends KpiKey>(cur: Kpis, prev: Kpis | null, keys: readonly K[]): Record<K, number | null> {
  const out = {} as Record<K, number | null>;
  for (const k of keys) out[k] = prev ? F.pctChange(cur[k] as number | null, prev[k] as number | null) : null;
  return out;
}
