/** Server-rendered dashboard blocks built from Kpis. */
import Link from "next/link";
import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import type { Kpis } from "@/lib/metrics/aggregate";
import * as F from "@/lib/metrics/formulas";
import { formatMoney, formatNumber, formatPct, formatRoas, NA } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "./kpi-card";
import { cn } from "@/lib/utils";

export const DEFS = {
  grossSales: "Σ line-item price × quantity before discounts, excluding gift cards, taxes and shipping (Shopify definition). Reported on the order date.",
  netSales: "Gross sales − discounts − returns. Returns are reported on the date of the refund, as in Shopify's reports.",
  metaSpend: "Total spend reported by Meta for the selected ad accounts, converted to the store currency with an explicit exchange rate.",
  orders: "Shopify orders placed (test orders excluded; cancelled orders are counted when placed and reversed in sales when cancelled).",
  aov: "Net sales ÷ orders.",
  shopifyRoas: "Shopify net sales ÷ Meta spend. Independent of Meta's attribution — this is what the store actually took in per unit of Meta spend.",
  metaRoas: "Meta-attributed purchase conversion value ÷ Meta spend. Meta's own modelled attribution (includes view-through; can over- or under-count).",
  profitRoas: "Net profit ÷ Meta spend.",
  cpa: "Meta spend ÷ Shopify orders (blended cost per order).",
  metaCpa: "Meta spend ÷ Meta-reported purchases.",
  netProfit: "Net sales − product cost − Meta spend − shipping costs − payment fees − other expenses.",
  profitMargin: "Net profit ÷ net sales × 100.",
  breakEven: "1 ÷ contribution margin before advertising (× 1 + ad-linked overhead rate). Shopify ROAS above this means advertising is covering its variable costs.",
};

export function KpiRow({ k, prev, currency, compareLabel }: { k: Kpis; prev: Kpis | null; currency: string; compareLabel: string | null }) {
  const ch = (key: keyof Kpis) => (prev ? F.pctChange(k[key] as number | null, prev[key] as number | null) : null);
  const cl = compareLabel;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <KpiCard label="Gross Sales" value={formatMoney(k.grossSales, currency)} change={ch("grossSales")} definition={DEFS.grossSales} compareLabel={cl} />
      <KpiCard label="Net Sales" value={formatMoney(k.netSales, currency)} change={ch("netSales")} definition={DEFS.netSales} compareLabel={cl} emphasis />
      <KpiCard label="Meta Ad Spend" value={formatMoney(k.metaSpend, currency)} change={ch("metaSpend")} upIsGood={false} definition={DEFS.metaSpend} compareLabel={cl} />
      <KpiCard label="Orders" value={formatNumber(k.orders)} change={ch("orders")} definition={DEFS.orders} compareLabel={cl} />
      <KpiCard label="AOV" value={formatMoney(k.aov, currency)} change={ch("aov")} definition={DEFS.aov} compareLabel={cl} />
      <KpiCard label="Shopify ROAS" value={formatRoas(k.shopifyRoas)} change={ch("shopifyRoas")} definition={DEFS.shopifyRoas} compareLabel={cl} sub={`Meta ROAS: ${formatRoas(k.metaRoas)}`} />
      <KpiCard
        label="Net Profit"
        value={formatMoney(k.netProfit, currency)}
        change={ch("netProfit")}
        definition={DEFS.netProfit}
        compareLabel={cl}
        emphasis
        warning={!k.productCostComplete && k.netProfit !== null ? `${formatNumber(k.unitsMissingCost)} units missing cost` : null}
      />
      <KpiCard label="Profit Margin" value={formatPct(k.profitMargin)} change={ch("profitMargin")} definition={DEFS.profitMargin} compareLabel={cl} />
    </div>
  );
}

export function RoasPanel({ k, currency, targetRoas }: { k: Kpis; currency: string; targetRoas: number | null }) {
  const status = k.breakEvenStatus;
  const S = {
    above: { icon: CheckCircle2, text: "Above break-even", cls: "text-good", badge: "good" as const },
    at: { icon: CheckCircle2, text: "At break-even", cls: "text-warning", badge: "warning" as const },
    below: { icon: XCircle, text: "Below break-even", cls: "text-critical", badge: "critical" as const },
    unknown: { icon: HelpCircle, text: "Break-even unknown", cls: "text-subtle", badge: "default" as const },
  }[status];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Is advertising profitable?</CardTitle>
        <CardDescription>Three different ROAS metrics — never interchangeable.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="Shopify ROAS" value={formatRoas(k.shopifyRoas)} hint="Net sales ÷ Meta spend" strong />
        <Metric label="Meta ROAS (attributed)" value={formatRoas(k.metaRoas)} hint="Meta purchase value ÷ spend" />
        <Metric label="Profit ROAS" value={formatRoas(k.profitRoas)} hint="Net profit ÷ Meta spend" />
        <Metric label="Break-even ROAS" value={formatRoas(k.breakEvenRoas)} hint={k.contributionMargin === null ? "Contribution margin unavailable" : `CM ${(k.contributionMargin * 100).toFixed(1)}% (${k.contributionMarginSource === "MANUAL" ? "manual" : "from data"})`} />
        <div className="col-span-2 flex items-center gap-2 md:col-span-4">
          <Badge variant={S.badge}><S.icon className="size-3.5" />{S.text}</Badge>
          <span className="text-xs text-muted-foreground">
            Current Shopify ROAS {formatRoas(k.shopifyRoas)} vs break-even {formatRoas(k.breakEvenRoas)}
            {targetRoas !== null ? ` · target ${formatRoas(targetRoas)}` : ""} · CPA {formatMoney(k.cpa, currency)} (Meta-reported CPA {formatMoney(k.metaCpa, currency)})
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, hint, strong }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-semibold", strong && "text-primary", value === NA && "text-subtle")}>{value}</div>
      <div className="text-[11px] text-subtle">{hint}</div>
    </div>
  );
}

/** The five questions the owner needs answered immediately. */
export function FiveQuestions({ k, currency, topAction }: { k: Kpis; currency: string; topAction: string | null }) {
  const profitable = k.breakEvenStatus === "above" ? "Yes" : k.breakEvenStatus === "below" ? "No" : k.breakEvenStatus === "at" ? "Break-even" : "Unknown";
  const items = [
    { q: "How much did I sell?", a: formatMoney(k.netSales, currency), sub: `net sales · ${formatNumber(k.orders)} orders` },
    { q: "How much did I spend on ads?", a: formatMoney(k.metaSpend, currency), sub: `Meta · ${formatPct(k.adSpendPct)} of net sales` },
    { q: "How much did I actually make?", a: formatMoney(k.netProfit, currency), sub: `net profit · ${formatPct(k.profitMargin)} margin` },
    { q: "Is my advertising profitable?", a: profitable, sub: `Shopify ROAS ${formatRoas(k.shopifyRoas)} vs break-even ${formatRoas(k.breakEvenRoas)}` },
    { q: "What should I do next?", a: topAction ? "See alert" : "No alerts", sub: topAction ?? "Nothing flagged for the last complete day." },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((i) => (
        <Card key={i.q} className="p-4">
          <div className="text-xs text-muted-foreground">{i.q}</div>
          <div className={cn("mt-1 text-xl font-semibold", i.a === NA && "text-subtle")}>{i.a}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{i.sub}</div>
        </Card>
      ))}
    </div>
  );
}

export function MetaVsShopify({ k, currency, threshold }: { k: Kpis; currency: string; threshold: number }) {
  const revDiff = k.metaPurchaseValue !== null && k.netSales !== null ? k.metaPurchaseValue - k.netSales : null;
  const revPct = F.discrepancyPct(k.metaPurchaseValue, k.netSales);
  const ordDiff = k.metaPurchases !== null && k.orders !== null ? k.metaPurchases - k.orders : null;
  const ordPct = F.discrepancyPct(k.metaPurchases, k.orders);
  const significant = (revPct !== null && Math.abs(revPct) >= threshold) || (ordPct !== null && Math.abs(ordPct) >= threshold);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Meta vs Shopify</CardTitle>
        <CardDescription>
          Meta numbers are platform-attributed (modelled, includes view-through, attribution window). Shopify numbers are actual store results. Difference % = (Meta − Shopify) ÷ Shopify.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {significant && (
          <div className="mb-3 flex items-start gap-2 rounded-md bg-warning-bg p-2 text-xs text-warning" role="alert">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Discrepancy above your {threshold}% threshold. Check pixel/CAPI setup, attribution window, and whether Meta is claiming sales also driven by other channels.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1 text-left font-medium">Metric</th>
                <th className="py-1 text-right font-medium">Meta (attributed)</th>
                <th className="py-1 text-right font-medium">Shopify (actual)</th>
                <th className="py-1 text-right font-medium">Difference</th>
                <th className="py-1 text-right font-medium">Difference %</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="py-1.5">Purchases / orders</td>
                <td className="text-right">{formatNumber(k.metaPurchases)}</td>
                <td className="text-right">{formatNumber(k.orders)}</td>
                <td className="text-right">{ordDiff === null ? NA : `${ordDiff > 0 ? "+" : ""}${formatNumber(ordDiff)}`}</td>
                <td className="text-right">{formatPct(ordPct)}</td>
              </tr>
              <tr className="border-t border-border">
                <td className="py-1.5">Revenue</td>
                <td className="text-right">{formatMoney(k.metaPurchaseValue, currency)}</td>
                <td className="text-right">{formatMoney(k.netSales, currency)}</td>
                <td className="text-right">{revDiff === null ? NA : formatMoney(revDiff, currency)}</td>
                <td className="text-right">{formatPct(revPct)}</td>
              </tr>
              <tr className="border-t border-border">
                <td className="py-1.5">ROAS</td>
                <td className="text-right">{formatRoas(k.metaRoas)}</td>
                <td className="text-right">{formatRoas(k.shopifyRoas)}</td>
                <td className="text-right">{k.metaRoas !== null && k.shopifyRoas !== null ? `${(k.metaRoas - k.shopifyRoas).toFixed(2)}x` : NA}</td>
                <td className="text-right">{formatPct(F.discrepancyPct(k.metaRoas, k.shopifyRoas))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-subtle">
          Note: Meta reports in the ad account timezone and attributes conversions to the ad interaction date; Shopify reports in the store timezone by order date. Daily comparisons can differ for these reasons alone.
        </p>
      </CardContent>
    </Card>
  );
}

/** Revenue → profit waterfall for the period. */
export function ProfitWaterfall({ k, currency }: { k: Kpis; currency: string }) {
  const steps: [string, number | null, "base" | "cost" | "result"][] = [
    ["Net sales", k.netSales, "base"],
    ["Product cost", k.productCost, "cost"],
    ["Meta ad spend", k.metaSpend, "cost"],
    ["Shipping costs", k.shippingCost, "cost"],
    ["Payment fees", k.paymentFees, "cost"],
    ["Other expenses", k.otherExpenses, "cost"],
    ["Net profit", k.netProfit, "result"],
  ];
  const max = Math.max(1, ...steps.map(([, v]) => Math.abs(v ?? 0)));
  return (
    <div className="flex flex-col gap-2">
      {steps.map(([label, v, kind]) => (
        <div key={label} className="grid grid-cols-[120px_1fr_110px] items-center gap-3 text-sm">
          <span className={cn("text-muted-foreground", kind !== "cost" && "font-medium text-foreground")}>{kind === "cost" ? `− ${label}` : label}</span>
          <div className="h-4 rounded bg-muted">
            {v !== null && (
              <div
                className="h-4 rounded"
                style={{
                  width: `${(Math.abs(v) / max) * 100}%`,
                  background: kind === "base" ? "var(--series-1)" : kind === "cost" ? "var(--series-2)" : v >= 0 ? "var(--series-3)" : "var(--series-8)",
                }}
              />
            )}
          </div>
          <span className={cn("text-right tabular", v === null && "text-subtle")}>{formatMoney(v, currency)}</span>
        </div>
      ))}
      {!k.productCostComplete && (
        <p className="text-xs text-warning">⚠ {formatNumber(k.unitsMissingCost)} units sold have no product cost. <Link className="underline" href="/products">Add costs</Link> — profit is overstated until then.</p>
      )}
    </div>
  );
}
