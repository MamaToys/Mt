import "server-only";
import { db } from "../db";
import { Kpis, bucketRows, computeKpis, sumRows, DailyRow } from "../metrics/aggregate";
import { DateStr, addDays, daysInMonth, startOfMonth, toUtcDate } from "../metrics/dates";
import { monthForecast } from "../metrics/forecast";
import { ViewParams } from "../params";
import { aiConfigured } from "../ai/service";
import { ensureSettings } from "../sync/rollup";
import { kpiOptions, loadCampaigns, loadDailyRows } from "./queries";
import type { SeriesPoint } from "@/components/dash/charts";
import type { BucketRow } from "@/components/dash/tables";

export function bucketLabel(key: DateStr, g: "day" | "week" | "month"): string {
  const d = toUtcDate(key);
  if (g === "month") return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  if (g === "week") return `Wk of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function toBuckets(rows: DailyRow[], g: "day" | "week" | "month", opts: ReturnType<typeof kpiOptions>, weekStartsOn: number): BucketRow[] {
  return bucketRows(rows, g, opts, weekStartsOn).map((b) => ({
    key: b.key,
    label: bucketLabel(b.key, g),
    kpis: b.kpis,
    complete: b.totals.daysWithShopify === b.totals.days && b.totals.daysWithMeta === b.totals.days,
    partial: g === "week" ? b.totals.days < 7 : g === "month" ? b.totals.days < daysInMonth(b.key) : false,
    hasData: b.totals.daysWithShopify > 0 || b.totals.daysWithMeta > 0,
  }));
}

export function toSeries(buckets: BucketRow[]): SeriesPoint[] {
  return buckets.map((b) => {
    const k = b.kpis;
    return {
      key: b.key,
      label: b.label,
      netSales: k.netSales,
      metaSpend: k.metaSpend,
      productCost: k.productCost,
      otherCosts: k.shippingCost === null || k.paymentFees === null || k.otherExpenses === null ? null : k.shippingCost + k.paymentFees + k.otherExpenses,
      netProfit: k.netProfit,
      orders: k.orders,
    };
  });
}

/** Everything the main dashboard renders, computed from precomputed rollups. */
export async function loadDashboard(storeId: string, view: ViewParams) {
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId }, include: { shopifyConnection: true, metaConnection: true } });
  const settings = await ensureSettings(storeId);
  const opts = kpiOptions(settings);
  const chartG = view.granularity === "hour" ? "day" : view.granularity;

  const monthRange = { from: addDays(startOfMonth(view.today), -14), to: view.today };
  const [cur, prev, campaigns, alerts, summary, monthRows] = await Promise.all([
    loadDailyRows(storeId, view.range, view.filters),
    view.compare ? loadDailyRows(storeId, view.compare, view.filters) : Promise.resolve(null),
    loadCampaigns(storeId, view.range, view.filters),
    db.alert.findMany({ where: { storeId, dismissedAt: null }, orderBy: [{ date: "desc" }, { severity: "desc" }], take: 20 }),
    db.aIAnalysis.findFirst({
      where: { storeId, kind: "daily_summary", dateFrom: toUtcDate(view.range.from), dateTo: toUtcDate(view.range.to) },
      orderBy: { createdAt: "desc" },
    }),
    loadDailyRows(storeId, monthRange),
  ]);
  const kpis: Kpis = computeKpis(sumRows(cur.rows), opts);
  const prevKpis: Kpis | null = prev ? computeKpis(sumRows(prev.rows), opts) : null;
  const dayBuckets = toBuckets(cur.rows, "day", opts, store.weekStartsOn);
  const chartBuckets = chartG === "day" ? dayBuckets : toBuckets(cur.rows, chartG, opts, store.weekStartsOn);
  const mtd = computeKpis(sumRows(monthRows.rows.filter((r) => r.date >= startOfMonth(view.today))), opts);

  return {
    store,
    settings: {
      targetRoas: settings.targetRoas === null ? null : Number(settings.targetRoas),
      targetCpa: settings.targetCpa === null ? null : Number(settings.targetCpa),
      targetProfitMargin: settings.targetProfitMargin === null ? null : Number(settings.targetProfitMargin) * 100,
      targetMonthlySales: settings.targetMonthlySales === null ? null : Number(settings.targetMonthlySales),
      targetMonthlyProfit: settings.targetMonthlyProfit === null ? null : Number(settings.targetMonthlyProfit),
      discrepancyThreshold: Number(settings.alertDiscrepancyPct),
    },
    connected: { shopify: !!store.shopifyConnection && store.shopifyConnection.status !== "DISCONNECTED", meta: !!store.metaConnection && store.metaConnection.status !== "DISCONNECTED" },
    scope: cur.scope,
    notes: cur.notes,
    kpis,
    prevKpis,
    dayBuckets,
    series: toSeries(chartBuckets),
    campaigns,
    alerts: alerts.map((a) => ({ id: a.id, severity: a.severity, title: a.title, message: a.message, date: a.date.toISOString().slice(0, 10) })),
    summary: summary ? { output: summary.output, createdAt: summary.createdAt.toISOString() } : null,
    aiConfigured: aiConfigured(),
    mtd,
    forecast: monthForecast(monthRows.rows, view.today),
  };
}
