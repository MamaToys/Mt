import { describe, expect, it } from "vitest";
import { ExpenseDef, allocateExpensesForDay, paymentFeesForDay, shippingCostForDay } from "@/lib/metrics/expenses";
import { FxTable } from "@/lib/metrics/currency";

const base = { netSales: 1000, grossSales: 1200, totalSales: 1300, metaSpend: 200 };
const e = (p: Partial<ExpenseDef>): ExpenseDef => ({
  id: "x", name: "x", category: "OTHER", type: "FIXED", frequency: "DAILY", amount: 10, percent: null, percentBase: null,
  startDate: "2026-10-01", endDate: null, ...p,
});

describe("expenses", () => {
  it("daily fixed", () => {
    expect(allocateExpensesForDay([e({})], "2026-10-02", base).total).toBe(10);
  });
  it("monthly fixed is spread over the days of that month", () => {
    const a = allocateExpensesForDay([e({ frequency: "MONTHLY", amount: 310 })], "2026-10-15", base);
    expect(a.total).toBeCloseTo(10);
  });
  it("one-time applies only on its date", () => {
    const x = e({ frequency: "ONE_TIME", amount: 500, startDate: "2026-10-03" });
    expect(allocateExpensesForDay([x], "2026-10-03", base).total).toBe(500);
    expect(allocateExpensesForDay([x], "2026-10-04", base).total).toBe(0);
  });
  it("respects start/end", () => {
    const x = e({ endDate: "2026-10-05" });
    expect(allocateExpensesForDay([x], "2026-09-30", base).total).toBe(0);
    expect(allocateExpensesForDay([x], "2026-10-06", base).total).toBe(0);
  });
  it("percentage of net sales is variable", () => {
    const a = allocateExpensesForDay([e({ type: "PERCENTAGE", percent: 5, percentBase: "NET_SALES" })], "2026-10-02", base);
    expect(a.total).toBe(50);
    expect(a.variable).toBe(50);
  });
  it("percentage of Meta spend counts as ad overhead", () => {
    const a = allocateExpensesForDay([e({ type: "PERCENTAGE", percent: 10, percentBase: "META_SPEND" })], "2026-10-02", base);
    expect(a.adLinked).toBe(20);
    expect(a.adOverheadRate).toBeCloseTo(0.1);
  });
  it("fixed expense with unavailable amount (no FX rate) is unavailable, not zero", () => {
    expect(allocateExpensesForDay([e({ amount: null })], "2026-10-02", base).total).toBeNull();
  });
  it("percentage with unavailable base is unavailable, not zero", () => {
    const a = allocateExpensesForDay([e({ type: "PERCENTAGE", percent: 10, percentBase: "META_SPEND" })], "2026-10-02", { ...base, metaSpend: null });
    expect(a.total).toBeNull();
  });
  it("payment fees and shipping cost models", () => {
    const s = { paymentFeePercent: 2.9, paymentFeeFixed: 0.3, shippingCostMode: "PER_ORDER" as const, shippingCostPerOrder: 6, shippingCostPercent: 0 };
    expect(paymentFeesForDay(s, 1000, 10)).toBeCloseTo(32);
    expect(shippingCostForDay(s, { orders: 10, shippingCharged: 50, netSales: 1000 })).toBe(60);
    expect(shippingCostForDay({ ...s, shippingCostMode: "EQUAL_TO_CHARGED" }, { orders: 10, shippingCharged: 50, netSales: 1000 })).toBe(50);
    expect(shippingCostForDay({ ...s, shippingCostMode: "PERCENT_OF_NET_SALES", shippingCostPercent: 5 }, { orders: 10, shippingCharged: 50, netSales: 1000 })).toBe(50);
  });
});

describe("currency handling", () => {
  const fx = new FxTable([{ base: "USD", quote: "OMR", date: "2026-10-01", rate: 0.385 }]);
  it("same currency converts 1:1", () => {
    expect(fx.convert(100, "OMR", "omr", "2026-10-01")).toBe(100);
  });
  it("uses direct and inverse rates", () => {
    expect(fx.convert(100, "USD", "OMR", "2026-10-01")).toBeCloseTo(38.5);
    expect(fx.convert(38.5, "OMR", "USD", "2026-10-01")).toBeCloseTo(100);
  });
  it("falls back to the most recent prior rate within the lookback window", () => {
    expect(fx.convert(100, "USD", "OMR", "2026-10-05")).toBeCloseTo(38.5);
    expect(fx.convert(100, "USD", "OMR", "2026-10-20")).toBeNull();
  });
  it("never silently mixes currencies: unknown pair returns null", () => {
    expect(fx.convert(100, "EUR", "OMR", "2026-10-01")).toBeNull();
    expect(fx.convert(100, "USD", "OMR", "2026-09-30")).toBeNull();
  });
});
