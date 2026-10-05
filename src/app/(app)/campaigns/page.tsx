import { Suspense } from "react";
import { requireStore } from "@/lib/session";
import { parseView, SearchParams } from "@/lib/params";
import { loadCampaigns } from "@/lib/reports/queries";
import { loadFilterOptions } from "@/lib/reports/options";
import { Card } from "@/components/ui/card";
import { CampaignTable } from "@/components/dash/campaign-table";
import { FilterBar } from "@/components/dash/filter-bar";
import { ExportLinks } from "@/components/dash/export-links";
import { Notes, PageHeader } from "@/components/dash/notices";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { store } = await requireStore();
  const view = parseView(await searchParams, store);
  const [data, options] = await Promise.all([loadCampaigns(store.id, view.range, { account: view.filters.account }), loadFilterOptions(store.id)]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Campaigns" description={`Campaign profitability · ${view.label}`}>
        <div className="flex flex-wrap gap-2">
          <Suspense><FilterBar options={options} show={["account"]} /></Suspense>
          <Suspense><ExportLinks reports={[{ id: "campaigns", label: "Campaign CSV" }]} /></Suspense>
        </div>
      </PageHeader>
      <Notes
        notes={[
          "Meta columns (Purchases, Meta Revenue, Meta ROAS) are Meta-attributed. Shopify columns are actual Shopify orders matched to the campaign by UTM parameters (utm_campaign = campaign ID or exact name) — orders without a match are not assigned to any campaign.",
          "Net Profit per campaign = attributed Shopify net sales − product cost − campaign spend − modelled shipping & payment fees. Fixed overheads are not allocated to campaigns.",
          ...(data.attributionAvailable && !data.shopifyComplete ? ["Shopify data is incomplete for part of this range, so campaign-level Shopify columns are N/A."] : []),
          data.attributionAvailable
            ? "Attribution is last-visit UTM and will under-count orders Meta influenced without a tagged visit (e.g. view-through, cross-device). Compare with Meta ROAS."
            : "Shopify campaign attribution unavailable: no Shopify orders carry UTM parameters that match your Meta campaigns. In Ads Manager set URL parameters to utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}.",
        ]}
      />
      <Card className="p-4">
        <CampaignTable rows={data.rows} currency={store.currency} attributionAvailable={data.attributionAvailable} from={view.range.from} to={view.range.to} />
      </Card>
    </div>
  );
}
