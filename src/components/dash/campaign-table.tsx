"use client";
import { useMemo, useState } from "react";
import { ArrowUpDown, Sparkles } from "lucide-react";
import type { CampaignRow } from "@/lib/reports/queries";
import { formatMoney, formatNumber, formatPct, formatRoas, NA } from "@/lib/format";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AiAnswer } from "./ai-panel";
import { cn } from "@/lib/utils";

type Key = keyof CampaignRow;

const COLS: { key: Key; label: string; fmt: (r: CampaignRow, c: string) => string; title?: string }[] = [
  { key: "spend", label: "Spend", fmt: (r, c) => formatMoney(r.spend, c) },
  { key: "impressions", label: "Impr.", fmt: (r) => formatNumber(r.impressions) },
  { key: "clicks", label: "Clicks", fmt: (r) => formatNumber(r.linkClicks || r.clicks) },
  { key: "ctr", label: "CTR", fmt: (r) => formatPct(r.ctr, 2) },
  { key: "cpc", label: "CPC", fmt: (r, c) => formatMoney(r.cpc, c) },
  { key: "purchases", label: "Purchases (Meta)", fmt: (r) => formatNumber(r.purchases, 0) },
  { key: "metaRevenue", label: "Meta Revenue", fmt: (r, c) => formatMoney(r.metaRevenue, c), title: "Meta-attributed purchase value" },
  { key: "metaRoas", label: "Meta ROAS", fmt: (r) => formatRoas(r.metaRoas) },
  { key: "shopifyOrders", label: "Shopify Orders", fmt: (r) => formatNumber(r.shopifyOrders), title: "UTM-attributed Shopify orders" },
  { key: "shopifyRevenue", label: "Shopify Revenue", fmt: (r, c) => formatMoney(r.shopifyRevenue, c), title: "Net sales of UTM-attributed Shopify orders" },
  { key: "shopifyRoas", label: "Shopify ROAS", fmt: (r) => formatRoas(r.shopifyRoas) },
  { key: "cpa", label: "CPA", fmt: (r, c) => formatMoney(r.cpa ?? r.metaCpa, c), title: "Spend ÷ attributed Shopify orders (Meta CPA when attribution unavailable)" },
  { key: "netProfit", label: "Net Profit", fmt: (r, c) => formatMoney(r.netProfit, c), title: "Attributed net sales − product cost − spend − variable costs" },
  { key: "profitMargin", label: "Margin", fmt: (r) => formatPct(r.profitMargin) },
];

const isActive = (s: string | null) => s === "ACTIVE";
const isPaused = (s: string | null) => !!s && /PAUSED|ARCHIVED|DELETED|CAMPAIGN_PAUSED/.test(s);

export function CampaignTable({
  rows,
  currency,
  attributionAvailable,
  from,
  to,
  limit,
}: {
  rows: CampaignRow[];
  currency: string;
  attributionAvailable: boolean;
  from: string;
  to: string;
  limit?: number;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "paused">("all");
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "spend", dir: -1 });
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  const view = useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q.toLowerCase()) &&
        (status === "all" || (status === "active" ? isActive(r.status) : isPaused(r.status))),
    );
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === null || av === undefined) return 1; // N/A always last
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * sort.dir;
      return ((av as number) - (bv as number)) * sort.dir;
    });
    return limit ? sorted.slice(0, limit) : sorted;
  }, [rows, q, status, sort, limit]);

  const toggle = (key: Key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search campaigns…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="Search campaigns" />
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status filter">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </NativeSelect>
        {!attributionAvailable && (
          <Badge variant="warning" title="No Shopify orders carry UTM parameters matching your Meta campaigns. Add utm_campaign={{campaign.id}} to your ad URL parameters.">
            Shopify campaign attribution unavailable
          </Badge>
        )}
      </div>
      <Table>
        <THead>
          <TR>
            <TH>
              <button className="flex items-center gap-1" onClick={() => toggle("name")}>Campaign <ArrowUpDown className="size-3" /></button>
            </TH>
            <TH>Status</TH>
            {COLS.map((c) => (
              <TH key={c.key} className="text-right" title={c.title} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                <button className="ml-auto flex items-center gap-1" onClick={() => toggle(c.key)}>
                  {c.label} <ArrowUpDown className={cn("size-3", sort.key === c.key && "text-primary")} />
                </button>
              </TH>
            ))}
            <TH />
          </TR>
        </THead>
        <TBody>
          {view.length === 0 && (
            <TR><TD colSpan={COLS.length + 3} className="py-6 text-center text-muted-foreground">No campaigns with data in this period.</TD></TR>
          )}
          {view.map((r) => (
            <TR key={r.campaignId}>
              <TD className="max-w-64 truncate font-medium" title={r.name}>{r.name}{r.fxMissing && <span className="ml-1 text-warning" title="Missing exchange rate for some days">⚠ FX</span>}</TD>
              <TD>
                <Badge variant={isActive(r.status) ? "good" : "outline"}>{r.status ?? "unknown"}</Badge>
              </TD>
              {COLS.map((c) => {
                const text = !attributionAvailable && ["shopifyOrders", "shopifyRevenue", "shopifyRoas", "netProfit", "profitMargin"].includes(c.key) ? NA : c.fmt(r, currency);
                return (
                  <TD key={c.key} className={cn("text-right", text === NA && "text-subtle")} title={text === NA && !attributionAvailable ? "Shopify campaign attribution unavailable" : undefined}>
                    {text}
                  </TD>
                );
              })}
              <TD>
                <Button size="sm" variant="ghost" onClick={() => setAnalyzing(analyzing === r.campaignId ? null : r.campaignId)} aria-expanded={analyzing === r.campaignId}>
                  <Sparkles /> Analyze
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {analyzing && (
        <AiAnswer
          key={analyzing}
          request={{ kind: "campaign", campaignId: analyzing, from, to }}
          title={`AI analysis — ${rows.find((r) => r.campaignId === analyzing)?.name ?? analyzing}`}
          onClose={() => setAnalyzing(null)}
        />
      )}
    </div>
  );
}
