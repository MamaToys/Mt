import { describe, expect, it } from "vitest";
import * as F from "@/lib/metrics/formulas";

describe("core formulas", () => {
  it("Shopify ROAS = net sales / Meta spend", () => {
    expect(F.shopifyRoas(100_000, 25_000)).toBe(4);
  });
  it("Meta ROAS = Meta purchase value / Meta spend", () => {
    expect(F.metaRoas(93_000, 25_000)).toBeCloseTo(3.72);
  });
  it("Profit ROAS = net profit / Meta spend", () => {
    expect(F.profitRoas(21_000, 25_000)).toBeCloseTo(0.84);
  });
  it("CPA = Meta spend / Shopify orders; Meta CPA uses Meta purchases", () => {
    expect(F.cpa(5_000, 200)).toBe(25);
    expect(F.metaCpa(5_000, 250)).toBe(20);
  });
  it("AOV = net sales / orders", () => {
    expect(F.aov(10_000, 80)).toBe(125);
  });
  it("net profit subtracts every cost component", () => {
    expect(
      F.netProfit({ netSales: 100_000, productCost: 35_000, metaSpend: 25_000, shippingCost: 8_000, paymentFees: 3_000, otherExpenses: 4_000 }),
    ).toBe(25_000);
  });
  it("net profit is null (not zero-filled) when a component is missing", () => {
    expect(F.netProfit({ netSales: 100, productCost: 10, metaSpend: null, shippingCost: 0, paymentFees: 0, otherExpenses: 0 })).toBeNull();
  });
  it("profit margin = net profit / net sales × 100", () => {
    expect(F.profitMargin(25_000, 100_000)).toBe(25);
  });
  it("ad spend % = spend / net sales × 100", () => {
    expect(F.adSpendPct(25_000, 100_000)).toBe(25);
  });
  it("break-even ROAS = 1 / contribution margin", () => {
    expect(F.breakEvenRoas(0.4)).toBeCloseTo(2.5);
  });
  it("break-even ROAS includes ad-linked overhead", () => {
    expect(F.breakEvenRoas(0.4, 0.1)).toBeCloseTo(2.75);
  });
  it("break-even ROAS is null when contribution margin <= 0", () => {
    expect(F.breakEvenRoas(0)).toBeNull();
    expect(F.breakEvenRoas(-0.1)).toBeNull();
  });
  it("break-even status", () => {
    expect(F.breakEvenStatus(3.21, 2.5)).toBe("above");
    expect(F.breakEvenStatus(2.1, 2.5)).toBe("below");
    expect(F.breakEvenStatus(null, 2.5)).toBe("unknown");
  });
  it("contribution margin before advertising", () => {
    expect(F.contributionMargin({ netSales: 1000, productCost: 400, shippingCost: 100, paymentFees: 30, variableExpenses: 70 })).toBeCloseTo(0.4);
  });
  it("discrepancy % = (Meta − Shopify) / Shopify × 100", () => {
    expect(F.discrepancyPct(50_000, 44_000)).toBeCloseTo(13.636, 2);
  });
});

describe("zero-division handling", () => {
  it("never returns Infinity or NaN", () => {
    expect(F.shopifyRoas(100, 0)).toBeNull();
    expect(F.metaRoas(100, 0)).toBeNull();
    expect(F.cpa(100, 0)).toBeNull();
    expect(F.aov(100, 0)).toBeNull();
    expect(F.profitMargin(10, 0)).toBeNull();
    expect(F.pctChange(10, 0)).toBeNull();
    expect(F.cpm(10, 0)).toBeNull();
    expect(F.safeDiv(0, 0)).toBeNull();
  });
  it("propagates unavailable inputs as null", () => {
    expect(F.shopifyRoas(null, 100)).toBeNull();
    expect(F.pctChange(null, 5)).toBeNull();
  });
  it("pctChange handles negative baselines", () => {
    expect(F.pctChange(-50, -100)).toBe(50);
    expect(F.pctChange(118, 100)).toBeCloseTo(18);
  });
  it("round is half-away-from-zero", () => {
    expect(F.round(1.005, 2)).toBe(1.01);
    expect(F.round(-1.005, 2)).toBe(-1.01);
  });
});
