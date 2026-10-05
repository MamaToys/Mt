import { Suspense } from "react";
import Link from "next/link";
import { requireStore } from "@/lib/session";
import { parseView, SearchParams } from "@/lib/params";
import { loadDashboard } from "@/lib/reports/view";
import { loadFilterOptions } from "@/lib/reports/options";
import { loadFreshness } from "@/lib/reports/queries";
import { formatDateTime, timeAgo } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FiveQuestions, KpiRow, MetaVsShopify, ProfitWaterfall, RoasPanel } from "@/components/dash/blocks";
import { ProfitCompositionChart, SalesSpendChart, NetProfitTrendChart } from "@/components/dash/charts";
import { DailyTable } from "@/components/dash/tables";
import { CampaignTable } from "@/components/dash/campaign-table";
import { AlertsList } from "@/components/dash/alerts-list";
import { AiSummary } from "@/components/dash/ai-panel";
import { FilterBar } from "@/components/dash/filter-bar";
import { ExportLinks } from "@/components/dash/export-links";
import { ForecastCard, TargetsCard } from "@/components/dash/targets";
import { Gaps, Notes, PageHeader, SectionTitle, SetupState } from "@/components/dash/notices";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { store } = await requireStore();
  const view = parseView(await searchParams, store);
  const [d, options, fresh] = await Promise.all([loadDashboard(store.id, view), loadFilterOptions(store.id), loadFreshness(store.id)]);
  const cur = store.currency;
  const k = d.kpis;
  const updated = fresh.computedAt ? `Metrics computed ${timeAgo(fresh.computedAt)} (${formatDateTime(fresh.computedAt, store.timezone)})` : "Metrics not computed yet";
  const topAlert = d.alerts.find((a) => a.severity !== "INFO") ?? d.alerts[0];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Dashboard" description={view.label}>
        <Suspense><FilterBar options={options} /></Suspense>
      </PageHeader>
      <SetupState shopify={d.connected.shopify} meta={d.connected.meta} />
      <Notes notes={d.notes} />
      <Gaps gaps={k.gaps} />

      <FiveQuestions k={k} currency={cur} topAction={topAlert ? `${topAlert.title}: ${topAlert.message}` : null} />
      <KpiRow k={k} prev={d.prevKpis} currency={cur} compareLabel={view.compareLabel} />
      <p className="-mt-2 text-[11px] text-subtle">{updated}{view.compareLabel ? ` · Changes vs ${view.compareLabel}` : ""}</p>

      <AiSummary
        initial={d.summary}
        configured={d.aiConfigured}
        request={{ kind: "daily_summary", from: view.range.from, to: view.range.to, compareFrom: view.compare?.from, compareTo: view.compare?.to, filters: { ...view.filters } }}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Shopify Sales vs Meta Spend</CardTitle>
            <CardDescription>
              {view.granularity === "hour" ? "Hourly view is on the Sales page (Meta spend is not available hourly). Showing daily." : `By ${view.granularity === "day" ? "day" : view.granularity}`} · {updated}
            </CardDescription>
          </CardHeader>
          <CardContent><SalesSpendChart data={d.series} currency={cur} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>From revenue to profit</CardTitle>
            <CardDescription>Each bar&apos;s height is net sales, split into costs and net profit. Losses fall below zero.</CardDescription>
          </CardHeader>
          <CardContent><ProfitCompositionChart data={d.series} currency={cur} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Net Profit Trend</CardTitle></CardHeader>
          <CardContent><NetProfitTrendChart data={d.series} currency={cur} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Period profit breakdown</CardTitle></CardHeader>
          <CardContent><ProfitWaterfall k={k} currency={cur} /></CardContent>
        </Card>
      </div>

      <RoasPanel k={k} currency={cur} targetRoas={d.settings.targetRoas} />
      <MetaVsShopify k={k} currency={cur} threshold={d.settings.discrepancyThreshold} />

      <div className="grid gap-4 lg:grid-cols-2">
        <TargetsCard mtd={d.mtd} settings={d.settings} currency={cur} />
        <ForecastCard f={d.forecast} currency={cur} />
      </div>

      <SectionTitle title="Alerts" updated="Evaluated after each sync on the last complete day / 7 days">
        <Link href="/alerts" className="text-xs text-primary">All alerts →</Link>
      </SectionTitle>
      <AlertsList alerts={d.alerts.slice(0, 6)} />

      <SectionTitle title="Campaign performance" updated={updated}>
        <div className="flex items-center gap-2">
          <Suspense><ExportLinks reports={[{ id: "campaigns", label: "Campaign CSV" }]} /></Suspense>
          <Link href="/campaigns" className="text-xs text-primary">All campaigns →</Link>
        </div>
      </SectionTitle>
      <Card className="p-4">
        <CampaignTable rows={d.campaigns.rows} currency={cur} attributionAvailable={d.campaigns.attributionAvailable} from={view.range.from} to={view.range.to} limit={10} />
      </Card>

      <SectionTitle title="Daily performance" updated={updated}>
        <Suspense><ExportLinks reports={[{ id: "daily", label: "Daily CSV" }, { id: "profit", label: "Profit CSV" }]} /></Suspense>
      </SectionTitle>
      <Card className="p-2"><DailyTable rows={d.dayBuckets} currency={cur} /></Card>
    </div>
  );
}
