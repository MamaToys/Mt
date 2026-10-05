"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { saveSettings } from "@/app/actions";

type Values = Record<string, string | boolean>;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</CardContent>
    </Card>
  );
}

export function SettingsForm({ values, timezones }: { values: Values; timezones: string[] }) {
  const v = (k: string) => String(values[k] ?? "");
  const [ship, setShip] = useState(v("shippingCostMode"));
  const [be, setBe] = useState(v("breakEvenMode"));
  const num = (name: string, label: string, hint?: string, step = "0.01") => (
    <Field label={label} hint={hint}><Input name={name} type="number" step={step} min="0" defaultValue={v(name)} /></Field>
  );
  return (
    <ActionForm action={saveSettings} submitLabel="Save settings">
      <Section title="Store" description="Reporting currency and timezone default to your Shopify store's. Every daily figure uses this timezone.">
        <Field label="Store name"><Input name="name" defaultValue={v("name")} required /></Field>
        <Field label="Reporting currency" hint="ISO code, e.g. USD, OMR"><Input name="currency" defaultValue={v("currency")} maxLength={3} required /></Field>
        <Field label="Timezone">
          <NativeSelect name="timezone" defaultValue={v("timezone")}>
            {timezones.map((t) => <option key={t} value={t}>{t}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Week starts on">
          <NativeSelect name="weekStartsOn" defaultValue={v("weekStartsOn")}>
            <option value="1">Monday</option>
            <option value="0">Sunday</option>
          </NativeSelect>
        </Field>
      </Section>
      <Section title="Profit calculation" description="Costs subtracted from net sales in addition to product cost, Meta spend and Expenses.">
        {num("paymentFeePercent", "Payment fee %", "e.g. 2.9 — applied to each order's total")}
        {num("paymentFeeFixed", "Payment fee per order", "e.g. 0.30")}
        <Field label="Shipping cost model">
          <NativeSelect name="shippingCostMode" value={ship} onChange={(e) => setShip(e.target.value)}>
            <option value="NONE">Not modelled (use Expenses)</option>
            <option value="PER_ORDER">Flat cost per order</option>
            <option value="EQUAL_TO_CHARGED">Equal to shipping charged</option>
            <option value="PERCENT_OF_NET_SALES">% of net sales</option>
          </NativeSelect>
        </Field>
        {ship === "PER_ORDER" ? num("shippingCostPerOrder", "Shipping cost per order") : <input type="hidden" name="shippingCostPerOrder" value={v("shippingCostPerOrder") || "0"} />}
        {ship === "PERCENT_OF_NET_SALES" ? num("shippingCostPercent", "Shipping cost % of net sales") : <input type="hidden" name="shippingCostPercent" value={v("shippingCostPercent") || "0"} />}
      </Section>
      <Section title="Break-even ROAS" description="Break-even ROAS = 1 ÷ contribution margin before advertising. 'From data' computes the margin from each period's actual costs.">
        <Field label="Contribution margin source">
          <NativeSelect name="breakEvenMode" value={be} onChange={(e) => setBe(e.target.value)}>
            <option value="AUTO">From data (recommended)</option>
            <option value="MANUAL">Manual</option>
          </NativeSelect>
        </Field>
        {be === "MANUAL" ? num("manualContributionMarginPct", "Contribution margin %", "e.g. 40 → break-even 2.50x") : <input type="hidden" name="manualContributionMarginPct" value={v("manualContributionMarginPct")} />}
      </Section>
      <Section title="Targets" description="Leave empty to not track.">
        {num("targetRoas", "Target Shopify ROAS")}
        {num("targetCpa", "Target CPA")}
        {num("targetProfitMarginPct", "Target profit margin %")}
        {num("targetMonthlySales", "Target monthly net sales")}
        {num("targetMonthlyProfit", "Target monthly net profit")}
      </Section>
      <Section title="Alert thresholds">
        {num("alertDiscrepancyPct", "Meta vs Shopify discrepancy warning %")}
        {num("alertCampaignSpendNoPurch", "Campaign 7-day spend without purchases")}
        {num("alertCampaignDailySpendMax", "Campaign daily spend above (optional)")}
        {num("alertCpaIncreasePct", "CPA increase % (week over week)")}
        {num("alertSalesDeclinePct", "Sales decline % (week over week)")}
        {num("alertRefundRatePct", "Refund rate % above")}
      </Section>
      <Section title="Attribution" description="Match Shopify orders to Meta campaigns using last-visit UTM parameters (utm_campaign = campaign ID or exact name).">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="utmAttributionEnabled" defaultChecked={values.utmAttributionEnabled === true} className="size-4" />
          Enable UTM campaign attribution
        </label>
      </Section>
    </ActionForm>
  );
}
