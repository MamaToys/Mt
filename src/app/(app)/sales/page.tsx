import { Suspense } from "react";
import Link from "next/link";
import { requireStore } from "@/lib/session";
import { parseView, SearchParams } from "@/lib/params";
import { computeKpis, sumRows } from "@/lib/metrics/aggregate";
import { kpiOptions, loadDailyRows, loadHourly } from "@/lib/reports/queries";
import { loadFilterOptions } from "@/lib/reports/options";
import { toBuckets, toSeries } from "@/lib/reports/view";
import { ensureSettings } from "@/lib/sync/rollup";
import { formatMoney, formatNumber, formatPct } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DailyTable, MonthlyTable, WeeklyTable } from "@/components/dash/tables";
import { HourlySalesChart, SalesSpendChart } from "@/components/dash/charts";
import { FilterBar } from "@/components/dash/filter-bar";
import { ExportLinks } from "@/components/dash/export-links";
import { Gaps, Notes, PageHeader } from "@/components/dash/notices";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
] as const;

export default async function SalesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { store } = await requireStore();
  const view = parseView(sp, store);
  const tab = (TABS.find((t) => t.id === sp.view)?.id ?? "daily") as "daily" | "weekly" | "monthly";
  const settings = await ensureSettings(store.id);
  const opts = kpiOptions(settings);
  const single = view.range.from === view.range.to;
  const [res, options, hourly] = await Promise.all([
    loadDailyRows(store.id, view.range, view.filters),
    loadFilterOptions(store.id),
    single ? loadHourly(store.id, view.range.from) : Promise.resolve(null),
  ]);
  const k = computeKpis(sumRows(res.rows), opts);
  const g = tab === "weekly" ? "week" : tab === "monthly" ? "month" : "day";
  const buckets = toBuckets(res.rows, g, opts, store.weekStartsOn);
  const c = store.currency;
  const qs = (t: string) => {
    const p = new URLSearchParams(Object.entries(sp).flatMap(([a, b]) => (typeof b === "string" ? [[a, b]] : [])));
    p.set("view", t);
    return `?${p}`;
  };
  const lines: [string, number | null, string, boolean?][] = [
    ["Gross sales", k.grossSales, "Σ line price × qty (gift cards excluded)"],
    ["− Discounts", k.discounts, "Line-item discount allocations"],
    ["− Returns", k.returns, "Refunded merchandise value, on the refund date"],
    ["= Net sales", k.netSales, "Gross − discounts − returns", true],
    ["+ Shipping charged", k.shippingCharged, "Net of shipping refunds"],
    ["+ Taxes", k.taxes, "Net of refunded taxes"],
    ["= Total sales", k.totalSales, "Net sales + shipping + taxes", true],
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Sales" description={`Shopify actual sales · ${view.label}`}>
        <Suspense><FilterBar options={options} show={["product", "g"]} /></Suspense>
      </PageHeader>
      <Notes notes={res.notes} />
      <Gaps gaps={k.gaps.filter((x) => !x.startsWith("Meta"))} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Revenue definitions</CardTitle>
            <CardDescription>Each line shown separately — Shopify&apos;s definitions.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm tabular">
              <tbody>
                {lines.map(([l, v, h, strong]) => (
                  <tr key={l} className={cn("border-t border-border first:border-0", strong && "font-semibold")}>
                    <td className="py-1.5" title={h}>{l}</td>
                    <td className="py-1.5 text-right">{formatMoney(v, c)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border text-muted-foreground">
                  <td className="py-1.5">Refunds paid out (money)</td>
                  <td className="py-1.5 text-right">{formatMoney(k.refundedAmount, c)}</td>
                </tr>
                <tr className="border-t border-border text-muted-foreground">
                  <td className="py-1.5">Orders · units</td>
                  <td className="py-1.5 text-right">{formatNumber(k.orders)} · {formatNumber(k.unitsSold)}</td>
                </tr>
                <tr className="border-t border-border text-muted-foreground">
                  <td className="py-1.5">AOV · return rate</td>
                  <td className="py-1.5 text-right">{formatMoney(k.aov, c)} · {formatPct(k.refundRate)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-subtle">Refunds paid out include tax and shipping refunds; &quot;Returns&quot; is the merchandise portion that reduces net sales. <Link className="underline" href="/definitions">Definitions</Link></p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{single ? "Sales by hour" : "Net sales vs Meta spend"}</CardTitle>
            <CardDescription>{single ? "Order-time sales before returns (store time). Hourly Meta spend is not available." : "Daily, store timezone"}</CardDescription>
          </CardHeader>
          <CardContent>
            {single && hourly ? <HourlySalesChart data={hourly} currency={c} /> : <SalesSpendChart data={toSeries(toBuckets(res.rows, view.granularity === "hour" ? "day" : view.granularity, opts, store.weekStartsOn))} currency={c} />}
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex gap-1 rounded-lg bg-muted p-1" aria-label="Aggregation">
          {TABS.map((t) => (
            <Link key={t.id} href={qs(t.id)} className={cn("rounded-md px-3 py-1 text-sm", tab === t.id ? "bg-card font-medium shadow-sm" : "text-muted-foreground")} aria-current={tab === t.id ? "page" : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
        <Suspense><ExportLinks reports={[{ id: tab, label: `${TABS.find((t) => t.id === tab)!.label} CSV` }]} /></Suspense>
      </div>
      <Card className="p-2">
        {tab === "daily" && <DailyTable rows={buckets} currency={c} />}
        {tab === "weekly" && <WeeklyTable rows={buckets} currency={c} />}
        {tab === "monthly" && <MonthlyTable rows={buckets} currency={c} />}
      </Card>
      <p className="text-[11px] text-subtle">⚠ marks periods where some days lack Shopify or Meta data (or partial weeks/months at the edges of the range). Missing data is shown as N/A, never zero.</p>
    </div>
  );
}
