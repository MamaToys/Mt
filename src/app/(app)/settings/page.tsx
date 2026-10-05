import { requireStore } from "@/lib/session";
import { ensureSettings } from "@/lib/sync/rollup";
import { PageHeader } from "@/components/dash/notices";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { store } = await requireStore();
  const s = await ensureSettings(store.id);
  const n = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" description="Store, profit model, targets and alert thresholds. Saving recalculates all historical metrics." />
      <SettingsForm
        timezones={Intl.supportedValuesOf("timeZone")}
        values={{
          name: store.name, currency: store.currency, timezone: store.timezone, weekStartsOn: String(store.weekStartsOn),
          paymentFeePercent: n(s.paymentFeePercent), paymentFeeFixed: n(s.paymentFeeFixed),
          shippingCostMode: s.shippingCostMode, shippingCostPerOrder: n(s.shippingCostPerOrder), shippingCostPercent: n(s.shippingCostPercent),
          breakEvenMode: s.breakEvenMode, manualContributionMarginPct: s.manualContributionMargin === null ? "" : String(Number(s.manualContributionMargin) * 100),
          targetRoas: n(s.targetRoas), targetCpa: n(s.targetCpa), targetProfitMarginPct: s.targetProfitMargin === null ? "" : String(Number(s.targetProfitMargin) * 100),
          targetMonthlySales: n(s.targetMonthlySales), targetMonthlyProfit: n(s.targetMonthlyProfit),
          alertDiscrepancyPct: n(s.alertDiscrepancyPct), alertCampaignSpendNoPurch: n(s.alertCampaignSpendNoPurch), alertCampaignDailySpendMax: n(s.alertCampaignDailySpendMax),
          alertCpaIncreasePct: n(s.alertCpaIncreasePct), alertSalesDeclinePct: n(s.alertSalesDeclinePct), alertRefundRatePct: n(s.alertRefundRatePct),
          utmAttributionEnabled: s.utmAttributionEnabled,
        }}
      />
    </div>
  );
}
