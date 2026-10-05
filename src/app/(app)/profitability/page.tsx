import { Suspense } from "react";
import Link from "next/link";
import { requireStore } from "@/lib/session";
import { parseView, SearchParams } from "@/lib/params";
import { addDays, startOfMonth } from "@/lib/metrics/dates";
import { computeKpis, sumRows } from "@/lib/metrics/aggregate";
import { monthForecast } from "@/lib/metrics/forecast";
import { kpiOptions, loadDailyRows } from "@/lib/reports/queries";
import { toBuckets, toSeries } from "@/lib/reports/view";
import { ensureSettings } from "@/lib/sync/rollup";
import { formatMoney, formatPct, formatRoas } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfitWaterfall, RoasPanel } from "@/components/dash/blocks";
import { ProfitCompositionChart } from "@/components/dash/charts";
import { MonthlyTable, WeeklyTable } from "@/components/dash/tables";
import { ForecastCard, TargetsCard } from "@/components/dash/targets";
import { ExportLinks } from "@/components/dash/export-links";
import { Gaps, PageHeader } from "@/components/dash/notices";

export const dynamic = "force-dynamic";

export default async function ProfitabilityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { store } = await requireStore();
  const view = parseView(await searchParams, store);
  const s = await ensureSettings(store.id);
  const opts = kpiOptions(s);
  const yearAgo = addDays(view.today, -364);
  const [res, history, month] = await Promise.all([
    loadDailyRows(store.id, view.range),
    loadDailyRows(store.id, { from: startOfMonth(yearAgo), to: view.today }),
    loadDailyRows(store.id, { from: addDays(startOfMonth(view.today), -14), to: view.today }),
  ]);
  const k = computeKpis(sumRows(res.rows), opts);
  const mtd = computeKpis(sumRows(month.rows.filter((r) => r.date >= startOfMonth(view.today))), opts);
  const c = store.currency;
  // Leading months before any data was imported are omitted (they would be all N/A).
  const allMonths = toBuckets(history.rows, "month", opts, store.weekStartsOn);
  const firstData = allMonths.findIndex((m) => m.hasData);
  const months = firstData < 0 ? [] : allMonths.slice(firstData);
  const weeks = toBuckets(history.rows.filter((r) => r.date >= addDays(view.today, -7 * 12)), "week", opts, store.weekStartsOn);
  const settings = {
    targetRoas: s.targetRoas === null ? null : Number(s.targetRoas),
    targetCpa: s.targetCpa === null ? null : Number(s.targetCpa),
    targetProfitMargin: s.targetProfitMargin === null ? null : Number(s.targetProfitMargin) * 100,
    targetMonthlySales: s.targetMonthlySales === null ? null : Number(s.targetMonthlySales),
    targetMonthlyProfit: s.targetMonthlyProfit === null ? null : Number(s.targetMonthlyProfit),
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Profitability" description={view.label}>
        <Suspense><ExportLinks reports={[{ id: "profit", label: "Profit CSV" }, { id: "monthly", label: "Monthly CSV" }]} /></Suspense>
      </PageHeader>
      <Gaps gaps={k.gaps} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Net profit calculation</CardTitle>
            <CardDescription>Net sales − product cost − Meta spend − shipping − payment fees − other expenses. Configure in <Link className="underline" href="/settings">Settings</Link> and <Link className="underline" href="/expenses">Expenses</Link>.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfitWaterfall k={k} currency={c} />
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div><div className="text-xs text-muted-foreground">Net margin</div><div className="font-semibold">{formatPct(k.profitMargin)}</div></div>
              <div><div className="text-xs text-muted-foreground">Ad spend % of sales</div><div className="font-semibold">{formatPct(k.adSpendPct)}</div></div>
              <div><div className="text-xs text-muted-foreground">Profit ROAS</div><div className="font-semibold">{formatRoas(k.profitRoas)}</div></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Break-even ROAS</CardTitle>
            <CardDescription>Based on this period&apos;s contribution margin before advertising{s.breakEvenMode === "MANUAL" ? " (manual override in Settings)" : ""}.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <table className="w-full tabular">
              <tbody>
                <tr><td className="py-1">Net sales</td><td className="text-right">{formatMoney(k.netSales, c)}</td></tr>
                <tr><td className="py-1">− Product cost</td><td className="text-right">{formatMoney(k.productCost, c)}</td></tr>
                <tr><td className="py-1">− Shipping costs</td><td className="text-right">{formatMoney(k.shippingCost, c)}</td></tr>
                <tr><td className="py-1">− Payment fees</td><td className="text-right">{formatMoney(k.paymentFees, c)}</td></tr>
                <tr><td className="py-1">− Variable (% of sales) expenses</td><td className="text-right">{formatMoney(k.variableExpenses, c)}</td></tr>
                <tr className="border-t border-border font-semibold"><td className="py-1">Contribution margin before ads</td><td className="text-right">{k.contributionMargin === null ? "N/A" : `${(k.contributionMargin * 100).toFixed(1)}%`}</td></tr>
                <tr><td className="py-1">Ad-linked overhead (e.g. agency % of spend)</td><td className="text-right">{(k.adOverheadRate * 100).toFixed(1)}%</td></tr>
                <tr className="border-t border-border font-semibold"><td className="py-1">Break-even ROAS = (1 + overhead) ÷ CM</td><td className="text-right">{formatRoas(k.breakEvenRoas)}</td></tr>
                <tr className="font-semibold"><td className="py-1">Current Shopify ROAS</td><td className="text-right">{formatRoas(k.shopifyRoas)}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              {k.breakEvenStatus === "above" ? "✔ Above break-even: each unit of Meta spend returns more contribution than it costs." : k.breakEvenStatus === "below" ? "✖ Below break-even: advertising is not covering its variable costs." : "Break-even status is unknown because some inputs are unavailable."}
              {k.contributionMargin !== null && k.contributionMargin <= 0 ? " Contribution margin is ≤ 0, so no ROAS can break even." : ""}
            </p>
          </CardContent>
        </Card>
      </div>
      <RoasPanel k={k} currency={c} targetRoas={settings.targetRoas} />
      <Card>
        <CardHeader><CardTitle>From revenue to profit — by month (last 12 months)</CardTitle></CardHeader>
        <CardContent><ProfitCompositionChart data={toSeries(months)} currency={c} /></CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <TargetsCard mtd={mtd} settings={settings} currency={c} />
        <ForecastCard f={monthForecast(month.rows, view.today)} currency={c} />
      </div>
      <Card className="p-2"><h2 className="p-2 text-sm font-semibold">Monthly (month-over-month)</h2><MonthlyTable rows={months} currency={c} /></Card>
      <Card className="p-2"><h2 className="p-2 text-sm font-semibold">Weekly (week-over-week, last 12 weeks)</h2><WeeklyTable rows={weeks} currency={c} /></Card>
    </div>
  );
}
