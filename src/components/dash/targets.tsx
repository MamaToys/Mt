import type { Kpis } from "@/lib/metrics/aggregate";
import type { Forecast } from "@/lib/metrics/forecast";
import { formatMoney, formatPct, formatRoas } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function Progress({ label, value, target, fmt }: { label: string; value: number | null; target: number; fmt: (v: number | null) => string }) {
  const pct = value === null || target === 0 ? null : (value / target) * 100;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular">{fmt(value)} / {fmt(target)} · {pct === null ? "N/A" : `${pct.toFixed(1)}%`}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-muted" role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        {pct !== null && <div className="h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: "var(--series-1)" }} />}
      </div>
    </div>
  );
}

export function TargetsCard({ mtd, settings, currency }: { mtd: Kpis; currency: string; settings: { targetRoas: number | null; targetCpa: number | null; targetProfitMargin: number | null; targetMonthlySales: number | null; targetMonthlyProfit: number | null } }) {
  const m = (v: number | null) => formatMoney(v, currency, { decimals: 0 });
  const none = Object.values(settings).every((v) => v === null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Targets — this month to date</CardTitle>
        <CardDescription>Set targets in Settings.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {none && <p className="text-sm text-muted-foreground">No targets set.</p>}
        {settings.targetMonthlySales !== null && <Progress label="Monthly net sales" value={mtd.netSales} target={settings.targetMonthlySales} fmt={m} />}
        {settings.targetMonthlyProfit !== null && <Progress label="Monthly net profit" value={mtd.netProfit} target={settings.targetMonthlyProfit} fmt={m} />}
        <div className="flex flex-wrap gap-2 text-xs">
          {settings.targetRoas !== null && (
            <Badge variant={mtd.shopifyRoas !== null && mtd.shopifyRoas >= settings.targetRoas ? "good" : "warning"}>Shopify ROAS {formatRoas(mtd.shopifyRoas)} / target {formatRoas(settings.targetRoas)}</Badge>
          )}
          {settings.targetCpa !== null && (
            <Badge variant={mtd.cpa !== null && mtd.cpa <= settings.targetCpa ? "good" : "warning"}>CPA {formatMoney(mtd.cpa, currency)} / target {formatMoney(settings.targetCpa, currency)}</Badge>
          )}
          {settings.targetProfitMargin !== null && (
            <Badge variant={mtd.profitMargin !== null && mtd.profitMargin >= settings.targetProfitMargin ? "good" : "warning"}>Margin {formatPct(mtd.profitMargin)} / target {formatPct(settings.targetProfitMargin)}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ForecastCard({ f, currency }: { f: Forecast; currency: string }) {
  const row = (label: string, v: { actual: number; forecast: number } | null) => (
    <div className="flex justify-between border-t border-border py-1.5 text-sm first:border-0">
      <span className="text-muted-foreground">{label}</span>
      {v ? (
        <span className="tabular">
          <span className="text-subtle">actual so far {formatMoney(v.actual, currency, { decimals: 0 })} → </span>
          <strong>{formatMoney(v.forecast, currency, { decimals: 0 })}</strong>
        </span>
      ) : (
        <span className="text-subtle">N/A (incomplete basis data)</span>
      )}
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">Forecast — {f.month} <Badge variant="outline">FORECAST</Badge></CardTitle>
        <CardDescription>Not actual results. Month-to-date actuals (complete days) + last {f.basisDays} days&apos; daily average × {f.daysRemaining} remaining days.</CardDescription>
      </CardHeader>
      <CardContent>
        {row("Expected monthly net sales", f.netSales)}
        {row("Expected monthly Meta spend", f.metaSpend)}
        {row("Expected monthly net profit", f.netProfit)}
      </CardContent>
    </Card>
  );
}
