"use client";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUpdateParams } from "@/components/layout/date-controls";

export interface FilterOptions {
  accounts: { id: string; name: string }[];
  campaigns: { id: string; name: string; accountId: string }[];
  adsets: { id: string; name: string; campaignId: string }[];
  ads: { id: string; name: string; adsetId: string }[];
  products: { id: string; name: string }[];
}

/** Filters live in the URL so every KPI, chart and table on the page updates together. */
export function FilterBar({ options, show = ["account", "campaign", "adset", "ad", "product", "g"] }: { options: FilterOptions; show?: string[] }) {
  const sp = useSearchParams();
  const update = useUpdateParams();
  const v = (k: string) => sp.get(k) ?? "";
  const campaign = v("campaign");
  const adset = v("adset");
  const account = v("account");
  const active = ["account", "campaign", "adset", "ad", "product"].some((k) => v(k));
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
      {show.includes("account") && options.accounts.length > 1 && (
        <NativeSelect aria-label="Meta account" value={account} onChange={(e) => update({ account: e.target.value, campaign: null, adset: null, ad: null })}>
          <option value="">All Meta accounts</option>
          {options.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </NativeSelect>
      )}
      {show.includes("campaign") && (
        <NativeSelect aria-label="Campaign" className="max-w-56" value={campaign} onChange={(e) => update({ campaign: e.target.value, adset: null, ad: null, product: null })}>
          <option value="">All campaigns</option>
          {options.campaigns.filter((c) => !account || c.accountId === account).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </NativeSelect>
      )}
      {show.includes("adset") && campaign && (
        <NativeSelect aria-label="Ad set" className="max-w-56" value={adset} onChange={(e) => update({ adset: e.target.value, ad: null })}>
          <option value="">All ad sets</option>
          {options.adsets.filter((s) => s.campaignId === campaign).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>
      )}
      {show.includes("ad") && adset && (
        <NativeSelect aria-label="Ad" className="max-w-56" value={v("ad")} onChange={(e) => update({ ad: e.target.value })}>
          <option value="">All ads</option>
          {options.ads.filter((a) => a.adsetId === adset).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </NativeSelect>
      )}
      {show.includes("product") && (
        <NativeSelect aria-label="Product" className="max-w-56" value={v("product")} onChange={(e) => update({ product: e.target.value, campaign: null, adset: null, ad: null })}>
          <option value="">All products</option>
          {options.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
      )}
      {show.includes("g") && (
        <NativeSelect aria-label="Granularity" value={v("g")} onChange={(e) => update({ g: e.target.value })}>
          <option value="">Auto granularity</option>
          <option value="hour">Hourly (single day)</option>
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </NativeSelect>
      )}
      {active && (
        <Button size="sm" variant="ghost" onClick={() => update({ account: null, campaign: null, adset: null, ad: null, product: null })}>
          <X /> Clear filters
        </Button>
      )}
    </div>
  );
}
