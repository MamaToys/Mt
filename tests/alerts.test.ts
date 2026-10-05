import { describe, expect, it } from "vitest";
import { evaluateAlerts, AlertContext } from "@/lib/alerts/engine";
import { DailyRow, computeKpis, sumRows } from "@/lib/metrics/aggregate";

function k(p: Partial<DailyRow>) {
  const row: DailyRow = {
    date: "2026-10-04", hasShopifyData: true, hasMetaData: true, grossSales: 1100, discounts: 100, returns: 0, netSales: 1000,
    shippingCharged: 0, taxes: 0, totalSales: 1000, refundedAmount: 0, orders: 10, cancelledOrders: 0, refundedOrders: 0, unitsSold: 10,
    productCost: 400, unitsMissingCost: 0, shippingCost: 50, paymentFees: 30, otherExpenses: 20, variableExpenses: 20, adLinkedExpenses: 0,
    metaSpend: 250, metaPurchases: 10, metaPurchaseValue: 1000, metaImpressions: 1000, metaClicks: 10, metaLinkClicks: 10, metaFxMissing: false, ...p,
  };
  return computeKpis(sumRows([row]), { breakEvenMode: "AUTO", manualContributionMargin: null });
}

const base = (): AlertContext => ({
  date: "2026-10-04",
  day: k({}), prevDay: k({}), week: k({}), prevWeek: k({}),
  campaigns: [], attributionAvailable: true,
  thresholds: { discrepancyPct: 20, campaignSpendNoPurchases: 100, campaignDailySpendMax: null, cpaIncreasePct: 25, salesDeclinePct: 20, refundRatePct: 10, targetProfitMargin: null, targetRoas: null },
  money: (v) => `$${v.toFixed(2)}`,
});
const types = (c: AlertContext) => evaluateAlerts(c).map((a) => a.type);

describe("alert rules", () => {
  it("no alerts on a healthy, stable business", () => {
    expect(types(base())).toEqual([]);
  });
  it("ROAS below break-even", () => {
    const c = base();
    c.week = k({ metaSpend: 900, metaPurchaseValue: 3000 }); // ROAS 1.11 < break-even 2.0
    expect(types(c)).toContain("roas_below_break_even");
  });
  it("spend up while sales lag, with ROAS drop in the message", () => {
    const c = base();
    c.day = k({ metaSpend: 330, netSales: 1040, grossSales: 1140 });
    const a = evaluateAlerts(c).find((x) => x.type === "spend_up_sales_lagging")!;
    expect(a.message).toMatch(/\+32%.*\+4%.*4\.00x to 3\.15x/);
  });
  it("CPA increase, sales decline, refund rate, discrepancy, margin target", () => {
    const c = base();
    c.prevWeek = k({ netSales: 2000, grossSales: 2100, orders: 20, metaSpend: 250 });
    c.week = k({ returns: 150, netSales: 850, metaPurchaseValue: 1500 });
    c.thresholds.targetProfitMargin = 50;
    const t = types(c);
    expect(t).toEqual(expect.arrayContaining(["cpa_increase", "sales_decline", "refund_rate_high", "meta_shopify_discrepancy", "margin_below_target"]));
  });
  it("campaign spending without purchases and above threshold; opportunity when far above break-even", () => {
    const c = base();
    c.thresholds.campaignDailySpendMax = 50;
    c.campaigns = [
      { id: "1", name: "Waste", spend7d: 300, purchases7d: 0, metaRoas7d: 0, shopifyRoas7d: 0, spendYesterday: 60 },
      { id: "2", name: "Winner", spend7d: 300, purchases7d: 30, metaRoas7d: 5, shopifyRoas7d: 4, spendYesterday: 40 },
    ];
    const t = evaluateAlerts(c).map((a) => `${a.type}:${a.key.split(":")[1]}`);
    expect(t).toEqual(expect.arrayContaining(["campaign_spend_no_purchases:1", "campaign_spend_above_threshold:1", "campaign_opportunity:2"]));
    expect(t).not.toContain("campaign_opportunity:1");
  });
  it("missing data never triggers alerts", () => {
    const c = base();
    c.week = k({ metaSpend: null, netSales: null, metaPurchaseValue: null, hasMetaData: false });
    c.day = k({ metaSpend: null, hasMetaData: false });
    expect(types(c)).toEqual([]);
  });
});
