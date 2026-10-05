/**
 * Business alert rules. Pure evaluation (evaluateAlerts) + DB persistence
 * (runAlerts). Rules only fire on available data — a missing metric never
 * triggers or suppresses an alert by being treated as zero.
 */
import { Kpis } from "../metrics/aggregate";
import * as F from "../metrics/formulas";

export type Severity = "INFO" | "WARNING" | "CRITICAL";

export interface AlertDraft {
  type: string;
  key: string;
  severity: Severity;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface AlertThresholds {
  discrepancyPct: number;
  campaignSpendNoPurchases: number;
  campaignDailySpendMax: number | null;
  cpaIncreasePct: number;
  salesDeclinePct: number;
  refundRatePct: number;
  targetProfitMargin: number | null; // %
  targetRoas: number | null;
}

export interface CampaignSnapshot {
  id: string;
  name: string;
  spend7d: number;
  purchases7d: number;
  metaRoas7d: number | null;
  shopifyRoas7d: number | null;
  spendYesterday: number;
}

export interface AlertContext {
  date: string; // last complete day (yesterday)
  day: Kpis; // last complete day
  prevDay: Kpis; // day before
  week: Kpis; // last 7 complete days
  prevWeek: Kpis; // the 7 days before that
  campaigns: CampaignSnapshot[];
  attributionAvailable: boolean;
  thresholds: AlertThresholds;
  money: (v: number) => string;
}

const x = (v: number) => `${v.toFixed(2)}x`;
const p = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;

export function evaluateAlerts(c: AlertContext): AlertDraft[] {
  const out: AlertDraft[] = [];
  const t = c.thresholds;

  // 1. ROAS below break-even (7 days)
  if (c.week.shopifyRoas !== null && c.week.breakEvenRoas !== null && c.week.shopifyRoas < c.week.breakEvenRoas) {
    out.push({
      type: "roas_below_break_even",
      key: c.date,
      severity: c.week.shopifyRoas < c.week.breakEvenRoas * 0.8 ? "CRITICAL" : "WARNING",
      title: "Shopify ROAS below break-even",
      message: `Last 7 days Shopify ROAS is ${x(c.week.shopifyRoas)}, below the break-even ROAS of ${x(c.week.breakEvenRoas)}. Advertising is currently not covering its variable costs.`,
      data: { shopifyRoas: c.week.shopifyRoas, breakEvenRoas: c.week.breakEvenRoas },
    });
  }

  // 2. Spend increasing while sales lag
  const spendChg = F.pctChange(c.day.metaSpend, c.prevDay.metaSpend);
  const salesChg = F.pctChange(c.day.netSales, c.prevDay.netSales);
  if (spendChg !== null && salesChg !== null && spendChg >= 20 && salesChg < spendChg - 15) {
    const roasNow = c.day.shopifyRoas;
    const roasPrev = c.prevDay.shopifyRoas;
    out.push({
      type: "spend_up_sales_lagging",
      key: c.date,
      severity: salesChg < 0 ? "CRITICAL" : "WARNING",
      title: "Ad spend growing faster than sales",
      message:
        `Meta spend changed ${p(spendChg)} on ${c.date} while Shopify net sales changed ${p(salesChg)}.` +
        (roasNow !== null && roasPrev !== null ? ` Shopify ROAS moved from ${x(roasPrev)} to ${x(roasNow)}.` : ""),
      data: { spendChg, salesChg },
    });
  }

  // 3. CPA increasing (7d vs prior 7d)
  const cpaChg = F.pctChange(c.week.cpa, c.prevWeek.cpa);
  if (cpaChg !== null && cpaChg >= t.cpaIncreasePct) {
    out.push({
      type: "cpa_increase",
      key: c.date,
      severity: "WARNING",
      title: "CPA increasing",
      message: `Blended CPA (Meta spend / Shopify orders) rose ${p(cpaChg)} to ${c.money(c.week.cpa!)} over the last 7 days vs the previous 7 days (${c.money(c.prevWeek.cpa!)}).`,
    });
  }

  // 4. Sales declining
  const wkSales = F.pctChange(c.week.netSales, c.prevWeek.netSales);
  if (wkSales !== null && wkSales <= -t.salesDeclinePct) {
    out.push({
      type: "sales_decline",
      key: c.date,
      severity: wkSales <= -2 * t.salesDeclinePct ? "CRITICAL" : "WARNING",
      title: "Sales declining",
      message: `Shopify net sales for the last 7 days are ${c.money(c.week.netSales!)}, ${p(wkSales)} vs the previous 7 days.`,
    });
  }

  // 5. Refund rate
  if (c.week.refundRate !== null && c.week.refundRate >= t.refundRatePct) {
    const prev = c.prevWeek.refundRate;
    out.push({
      type: "refund_rate_high",
      key: c.date,
      severity: "WARNING",
      title: "Refund rate elevated",
      message: `Returns were ${c.week.refundRate.toFixed(1)}% of sales after discounts over the last 7 days${prev !== null ? ` (previous 7 days: ${prev.toFixed(1)}%)` : ""}.`,
    });
  }

  // 6. Meta vs Shopify discrepancy
  const disc = F.discrepancyPct(c.week.metaPurchaseValue, c.week.netSales);
  if (disc !== null && Math.abs(disc) >= t.discrepancyPct) {
    out.push({
      type: "meta_shopify_discrepancy",
      key: c.date,
      severity: "INFO",
      title: "Large Meta vs Shopify discrepancy",
      message: `Meta-attributed revenue (${c.money(c.week.metaPurchaseValue!)}) differs from Shopify net sales (${c.money(c.week.netSales!)}) by ${p(disc)} over the last 7 days. Meta attribution is modelled and includes view-through; Shopify is actual store revenue.`,
    });
  }

  // 7–8. Campaign rules
  for (const camp of c.campaigns) {
    if (camp.spend7d >= t.campaignSpendNoPurchases && camp.purchases7d === 0 && (!c.attributionAvailable || (camp.shopifyRoas7d ?? 0) === 0)) {
      out.push({
        type: "campaign_spend_no_purchases",
        key: `${c.date}:${camp.id}`,
        severity: "WARNING",
        title: "Campaign spending without purchases",
        message: `"${camp.name}" spent ${c.money(camp.spend7d)} in the last 7 days with 0 Meta-reported purchases${c.attributionAvailable ? " and no UTM-attributed Shopify orders" : ""}.`,
        data: { campaignId: camp.id },
      });
    }
    if (t.campaignDailySpendMax !== null && camp.spendYesterday > t.campaignDailySpendMax) {
      out.push({
        type: "campaign_spend_above_threshold",
        key: `${c.date}:${camp.id}`,
        severity: "INFO",
        title: "Campaign above daily spend threshold",
        message: `"${camp.name}" spent ${c.money(camp.spendYesterday)} on ${c.date}, above your threshold of ${c.money(t.campaignDailySpendMax)}.`,
        data: { campaignId: camp.id },
      });
    }
    const be = c.week.breakEvenRoas;
    const roas = c.attributionAvailable ? camp.shopifyRoas7d : null;
    if (be !== null && roas !== null && roas >= be * 1.5 && camp.spend7d >= t.campaignSpendNoPurchases) {
      out.push({
        type: "campaign_opportunity",
        key: `${c.date}:${camp.id}`,
        severity: "INFO",
        title: "Opportunity: campaign well above break-even",
        message: `"${camp.name}" has a UTM-attributed Shopify ROAS of ${x(roas)} over 7 days (break-even ${x(be)}). It may deserve more budget — scale gradually and watch marginal ROAS.`,
        data: { campaignId: camp.id },
      });
    }
  }

  // 9. Margin below target
  if (t.targetProfitMargin !== null && c.week.profitMargin !== null && c.week.profitMargin < t.targetProfitMargin) {
    out.push({
      type: "margin_below_target",
      key: c.date,
      severity: c.week.profitMargin < 0 ? "CRITICAL" : "WARNING",
      title: "Profit margin below target",
      message: `Net profit margin over the last 7 days is ${c.week.profitMargin.toFixed(1)}%, below your ${t.targetProfitMargin.toFixed(1)}% target.`,
    });
  }

  // 10. ROAS below target
  if (t.targetRoas !== null && c.week.shopifyRoas !== null && c.week.shopifyRoas < t.targetRoas) {
    out.push({
      type: "roas_below_target",
      key: c.date,
      severity: "INFO",
      title: "Shopify ROAS below target",
      message: `Last 7 days Shopify ROAS is ${x(c.week.shopifyRoas)} vs target ${x(t.targetRoas)}.`,
    });
  }

  return out;
}
