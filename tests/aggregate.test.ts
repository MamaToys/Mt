import { describe, expect, it } from "vitest";
import { DailyRow, bucketRows, computeKpis, sumRows } from "@/lib/metrics/aggregate";

function row(date: string, p: Partial<DailyRow> = {}): DailyRow {
  return {
    date, hasShopifyData: true, hasMetaData: true,
    grossSales: 1100, discounts: 100, returns: 0, netSales: 1000, shippingCharged: 50, taxes: 100, totalSales: 1150,
    refundedAmount: 0, orders: 10, cancelledOrders: 0, refundedOrders: 0, unitsSold: 20,
    productCost: 400, unitsMissingCost: 0, shippingCost: 50, paymentFees: 30, otherExpenses: 20,
    variableExpenses: 20, adLinkedExpenses: 0,
    metaSpend: 250, metaPurchases: 12, metaPurchaseValue: 1200, metaImpressions: 10000, metaClicks: 200, metaLinkClicks: 150,
    metaFxMissing: false, ...p,
  };
}
const opts = { breakEvenMode: "AUTO" as const, manualContributionMargin: null };

describe("aggregation", () => {
  it("sums days and derives KPIs", () => {
    const k = computeKpis(sumRows([row("2026-10-01"), row("2026-10-02")]), opts);
    expect(k.netSales).toBe(2000);
    expect(k.metaSpend).toBe(500);
    expect(k.orders).toBe(20);
    expect(k.aov).toBe(100);
    expect(k.shopifyRoas).toBe(4);
    expect(k.metaRoas).toBe(4.8);
    expect(k.cpa).toBe(25);
    expect(k.netProfit).toBe(2000 - 800 - 500 - 100 - 60 - 40);
    expect(k.profitMargin).toBeCloseTo(25);
    expect(k.contributionMargin).toBeCloseTo((2000 - 800 - 100 - 60 - 40) / 2000);
    expect(k.breakEvenRoas).toBeCloseTo(2000 / 1000);
    expect(k.breakEvenStatus).toBe("above");
  });

  it("missing data is NOT zero: one day without Meta data nulls the period spend", () => {
    const t = sumRows([row("2026-10-01"), row("2026-10-02", { hasMetaData: false, metaSpend: null, metaPurchaseValue: null })]);
    const k = computeKpis(t, opts);
    expect(k.metaSpend).toBeNull();
    expect(k.shopifyRoas).toBeNull();
    expect(k.netProfit).toBeNull();
    expect(k.netSales).toBe(2000); // Shopify side unaffected
    expect(k.gaps.join(" ")).toMatch(/Meta data unavailable for 1 of 2/);
  });

  it("manual contribution margin overrides auto", () => {
    const k = computeKpis(sumRows([row("2026-10-01")]), { breakEvenMode: "MANUAL", manualContributionMargin: 0.4 });
    expect(k.breakEvenRoas).toBeCloseTo(2.5);
  });

  it("weekly aggregation groups by week start", () => {
    const rows = ["2026-09-28", "2026-09-30", "2026-10-04", "2026-10-05", "2026-10-06"].map((d) => row(d));
    const weeks = bucketRows(rows, "week", opts, 1);
    expect(weeks.map((w) => [w.key, w.totals.days])).toEqual([["2026-09-28", 3], ["2026-10-05", 2]]);
    expect(weeks[0].kpis.netSales).toBe(3000);
  });

  it("monthly aggregation", () => {
    const rows = ["2026-09-29", "2026-09-30", "2026-10-01"].map((d) => row(d));
    const months = bucketRows(rows, "month", opts);
    expect(months.map((m) => [m.key, m.kpis.netSales])).toEqual([["2026-09-01", 2000], ["2026-10-01", 1000]]);
  });

  it("daily aggregation keeps each day separate", () => {
    const days = bucketRows([row("2026-10-02"), row("2026-10-01")], "day", opts);
    expect(days.map((d) => d.key)).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("zero spend yields N/A ROAS, not Infinity", () => {
    const k = computeKpis(sumRows([row("2026-10-01", { metaSpend: 0, metaPurchaseValue: 0 })]), opts);
    expect(k.shopifyRoas).toBeNull();
    expect(k.cpa).toBe(0); // zero spend over real orders is a genuine 0 CPA
    expect(k.profitRoas).toBeNull();
  });

  it("zero net sales yields N/A margin", () => {
    const k = computeKpis(sumRows([row("2026-10-01", { netSales: 0, grossSales: 0, discounts: 0 })]), opts);
    expect(k.profitMargin).toBeNull();
  });
});
