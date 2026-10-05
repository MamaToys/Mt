import { Suspense } from "react";
import { requireStore } from "@/lib/session";
import { parseView, SearchParams } from "@/lib/params";
import { computeKpis, sumRows } from "@/lib/metrics/aggregate";
import * as F from "@/lib/metrics/formulas";
import { kpiOptions, loadDailyRows, loadMetaEntities } from "@/lib/reports/queries";
import { loadFilterOptions } from "@/lib/reports/options";
import { ensureSettings } from "@/lib/sync/rollup";
import { formatMoney, formatNumber, formatPct, formatRoas } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { KpiCard } from "@/components/dash/kpi-card";
import { DEFS } from "@/components/dash/blocks";
import { FilterBar } from "@/components/dash/filter-bar";
import { Gaps, Notes, PageHeader } from "@/components/dash/notices";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Entity = Awaited<ReturnType<typeof loadMetaEntities>>[number];

function EntityTable({ rows, currency, label }: { rows: Entity[]; currency: string; label: string }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>{label}</TH><TH>Status</TH><TH className="text-right">Spend</TH><TH className="text-right">Impr.</TH><TH className="text-right">Link clicks</TH>
          <TH className="text-right">CTR</TH><TH className="text-right">CPC</TH><TH className="text-right">CPM</TH><TH className="text-right">Purchases</TH>
          <TH className="text-right">Meta revenue</TH><TH className="text-right">Meta ROAS</TH><TH className="text-right">Meta CPA</TH>
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 && <TR><TD colSpan={12} className="py-6 text-center text-muted-foreground">No delivery in this period.</TD></TR>}
        {rows.slice(0, 200).map((r) => (
          <TR key={r.id}>
            <TD className="max-w-72 truncate" title={r.name}>{r.name}</TD>
            <TD className="text-xs text-muted-foreground">{r.status ?? "—"}</TD>
            <TD className="text-right">{formatMoney(r.spend, currency)}</TD>
            <TD className="text-right">{formatNumber(r.impressions)}</TD>
            <TD className="text-right">{formatNumber(r.linkClicks)}</TD>
            <TD className="text-right">{formatPct(r.ctr, 2)}</TD>
            <TD className="text-right">{formatMoney(r.cpc, currency)}</TD>
            <TD className="text-right">{formatMoney(r.cpm, currency)}</TD>
            <TD className="text-right">{formatNumber(r.purchases)}</TD>
            <TD className="text-right">{formatMoney(r.value, currency)}</TD>
            <TD className="text-right">{formatRoas(r.metaRoas)}</TD>
            <TD className="text-right">{formatMoney(r.metaCpa, currency)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export default async function MetaAdsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { store } = await requireStore();
  const view = parseView(await searchParams, store);
  const settings = await ensureSettings(store.id);
  const [res, options, adsets, ads, accounts] = await Promise.all([
    loadDailyRows(store.id, view.range, view.filters),
    loadFilterOptions(store.id),
    loadMetaEntities(store.id, view.range, "ADSET", view.filters),
    loadMetaEntities(store.id, view.range, "AD", view.filters),
    db.metaAdAccount.findMany({ where: { storeId: store.id, isSelected: true } }),
  ]);
  const k = computeKpis(sumRows(res.rows), kpiOptions(settings));
  const c = store.currency;
  const mismatchTz = accounts.filter((a) => a.timezone && a.timezone !== store.timezone);
  const fxAccounts = accounts.filter((a) => a.currency !== store.currency);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Meta Ads" description={`Meta-reported (platform-attributed) performance · ${view.label}`}>
        <Suspense><FilterBar options={options} show={["account", "campaign", "adset", "ad"]} /></Suspense>
      </PageHeader>
      <Notes
        notes={[
          ...res.notes,
          "Everything on this page is reported by Meta. Purchases and revenue are Meta's attributed conversions (account attribution setting), not Shopify sales.",
          ...mismatchTz.map((a) => `Ad account "${a.name}" reports in ${a.timezone}, the store uses ${store.timezone}. Daily Meta figures are bucketed by Meta's day, so day-level comparisons with Shopify can be offset.`),
          ...fxAccounts.map((a) => `Ad account "${a.name}" is billed in ${a.currency}; amounts are converted to ${store.currency} using the exchange rates in Integrations.`),
        ]}
      />
      <Gaps gaps={k.gaps.filter((g) => !g.startsWith("Shopify") && !g.includes("product cost"))} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Spend" value={formatMoney(k.metaSpend, c)} definition={DEFS.metaSpend} compareLabel={null} />
        <KpiCard label="Impressions" value={formatNumber(k.metaImpressions)} definition="Times ads were shown." compareLabel={null} />
        <KpiCard label="CTR (link)" value={formatPct(k.ctr, 2)} definition="Link clicks ÷ impressions × 100." compareLabel={null} />
        <KpiCard label="CPC (link)" value={formatMoney(k.cpc, c)} definition="Spend ÷ link clicks." compareLabel={null} />
        <KpiCard label="CPM" value={formatMoney(k.cpm, c)} definition="Spend ÷ impressions × 1,000." compareLabel={null} />
        <KpiCard label="Meta purchases" value={formatNumber(k.metaPurchases)} definition="Purchases attributed by Meta (one action type, see Definitions)." compareLabel={null} />
        <KpiCard label="Meta revenue" value={formatMoney(k.metaPurchaseValue, c)} definition="Purchase conversion value attributed by Meta." compareLabel={null} />
        <KpiCard label="Meta ROAS" value={formatRoas(k.metaRoas)} definition={DEFS.metaRoas} compareLabel={null} />
        <KpiCard label="Meta CPA" value={formatMoney(F.metaCpa(k.metaSpend, k.metaPurchases), c)} definition={DEFS.metaCpa} compareLabel={null} />
        <KpiCard label="Shopify ROAS (for contrast)" value={formatRoas(k.shopifyRoas)} definition={DEFS.shopifyRoas} compareLabel={null} />
      </div>
      <Card>
        <CardHeader><CardTitle>Ad sets</CardTitle><CardDescription>Meta-reported. Use the campaign filter to drill down.</CardDescription></CardHeader>
        <CardContent><EntityTable rows={adsets} currency={c} label="Ad set" /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Ads</CardTitle><CardDescription>Top 200 by spend.</CardDescription></CardHeader>
        <CardContent><EntityTable rows={ads} currency={c} label="Ad" /></CardContent>
      </Card>
    </div>
  );
}
