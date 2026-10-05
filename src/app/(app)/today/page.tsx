import { Suspense } from "react";
import { requireStore } from "@/lib/session";
import { addDays, todayIn, localHourOf } from "@/lib/metrics/dates";
import { computeKpis, sumRows } from "@/lib/metrics/aggregate";
import { kpiOptions, loadDailyRows, loadFreshness, loadHourly, loadCampaigns } from "@/lib/reports/queries";
import { ensureSettings } from "@/lib/sync/rollup";
import * as F from "@/lib/metrics/formulas";
import { formatDateTime, formatMoney, formatNumber, formatPct, formatRoas, timeAgo } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/dash/kpi-card";
import { DEFS, MetaVsShopify } from "@/components/dash/blocks";
import { HourlySalesChart } from "@/components/dash/charts";
import { CampaignTable } from "@/components/dash/campaign-table";
import { RefreshButton } from "@/components/layout/refresh-button";
import { Gaps, PageHeader, SetupState } from "@/components/dash/notices";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { store } = await requireStore();
  const today = todayIn(store.timezone);
  const yesterday = addDays(today, -1);
  const settings = await ensureSettings(store.id);
  const opts = kpiOptions(settings);
  const [t, y, hourly, fresh, campaigns, conns] = await Promise.all([
    loadDailyRows(store.id, { from: today, to: today }),
    loadDailyRows(store.id, { from: yesterday, to: yesterday }),
    loadHourly(store.id, today),
    loadFreshness(store.id),
    loadCampaigns(store.id, { from: today, to: today }),
    db.store.findUniqueOrThrow({ where: { id: store.id }, select: { shopifyConnection: { select: { status: true } }, metaConnection: { select: { status: true } } } }),
  ]);
  const k = computeKpis(sumRows(t.rows), opts);
  const yk = computeKpis(sumRows(y.rows), opts);
  const hour = localHourOf(new Date(), store.timezone);
  const ch = (a: number | null, b: number | null) => F.pctChange(a, b);
  const c = store.currency;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Today" description={`${today} so far (store time ${String(hour).padStart(2, "0")}:00, ${store.timezone}). Changes are vs ALL of yesterday, so they will rise through the day.`}>
        <RefreshButton label="Refresh data" />
      </PageHeader>
      <SetupState shopify={!!conns.shopifyConnection && conns.shopifyConnection.status !== "DISCONNECTED"} meta={!!conns.metaConnection && conns.metaConnection.status !== "DISCONNECTED"} />
      <Card className="p-4 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>Last Shopify update: <strong>{formatDateTime(fresh.shopify?.lastSuccessfulSyncAt, store.timezone)}</strong> ({timeAgo(fresh.shopify?.lastSuccessfulSyncAt)}){fresh.shopify?.webhooks ? " · live webhooks on" : ""}</span>
          <span>Last Meta update: <strong>{formatDateTime(fresh.meta?.lastSuccessfulSyncAt, store.timezone)}</strong> ({timeAgo(fresh.meta?.lastSuccessfulSyncAt)})</span>
        </div>
        <p className="mt-1 text-xs text-subtle">Shopify orders arrive via webhooks within seconds when configured, otherwise every 15 minutes. Meta reports spend with a delay (typically 15 min to several hours) and keeps revising it; today&apos;s Meta numbers are provisional.</p>
      </Card>
      <Gaps gaps={k.gaps} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="Today's Shopify sales" value={formatMoney(k.netSales, c)} change={ch(k.netSales, yk.netSales)} definition={DEFS.netSales} sub={`Gross ${formatMoney(k.grossSales, c)}`} />
        <KpiCard label="Today's orders" value={formatNumber(k.orders)} change={ch(k.orders, yk.orders)} definition={DEFS.orders} />
        <KpiCard label="Today's Meta spend" value={formatMoney(k.metaSpend, c)} change={ch(k.metaSpend, yk.metaSpend)} upIsGood={false} definition={DEFS.metaSpend} />
        <KpiCard label="Shopify ROAS" value={formatRoas(k.shopifyRoas)} change={ch(k.shopifyRoas, yk.shopifyRoas)} definition={DEFS.shopifyRoas} sub={`Yesterday ${formatRoas(yk.shopifyRoas)}`} />
        <KpiCard label="Meta ROAS" value={formatRoas(k.metaRoas)} change={ch(k.metaRoas, yk.metaRoas)} definition={DEFS.metaRoas} />
        <KpiCard label="Estimated profit so far" value={formatMoney(k.netProfit, c)} change={ch(k.netProfit, yk.netProfit)} definition={`${DEFS.netProfit} Daily/monthly fixed expenses are accrued for the full day, so the morning figure is conservative.`} />
        <KpiCard label="Profit margin" value={formatPct(k.profitMargin)} change={ch(k.profitMargin, yk.profitMargin)} definition={DEFS.profitMargin} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sales by hour (today)</CardTitle>
          <CardDescription>From Shopify order timestamps (store time), before returns. Meta does not provide reliable hourly spend here, so none is shown.</CardDescription>
        </CardHeader>
        <CardContent><HourlySalesChart data={hourly} currency={c} /></CardContent>
      </Card>
      <MetaVsShopify k={k} currency={c} threshold={Number(settings.alertDiscrepancyPct)} />
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">Campaigns today</h2>
        <Suspense>
          <CampaignTable rows={campaigns.rows} currency={c} attributionAvailable={campaigns.attributionAvailable} from={today} to={today} />
        </Suspense>
      </Card>
    </div>
  );
}
