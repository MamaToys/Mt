import { describe, expect, it } from "vitest";
import { LedgerOrder, buildLedger, netSalesOf } from "@/lib/metrics/accounting";

const cost = (c: Record<string, number>) => (l: { variantExternalId: string | null }) =>
  l.variantExternalId && l.variantExternalId in c ? c[l.variantExternalId] : null;

function order(p: Partial<LedgerOrder> = {}): LedgerOrder {
  return {
    externalId: "1001",
    localDate: "2026-10-01",
    test: false,
    financialStatus: "PAID",
    cancelledLocalDate: null,
    totalPrice: 230,
    totalShipping: 10,
    totalTax: 20,
    attributedCampaignId: null,
    lines: [
      { id: "L1", productExternalId: "P1", variantExternalId: "V1", sku: "A", title: "Shirt", quantity: 2, originalUnitPrice: 100, totalDiscount: 0, shopifyUnitCost: null, isGiftCard: false },
    ],
    refunds: [],
    ...p,
  };
}

describe("Shopify sales ledger", () => {
  it("computes gross, discounts, net, shipping and tax on the order date", () => {
    const o = order({ lines: [{ id: "L1", productExternalId: "P1", variantExternalId: "V1", sku: "A", title: "Shirt", quantity: 2, originalUnitPrice: 100, totalDiscount: 20, shopifyUnitCost: null, isGiftCard: false }] });
    const d = buildLedger([o], cost({ V1: 30 })).days.get("2026-10-01")!;
    expect(d.grossSales).toBe(200);
    expect(d.discounts).toBe(20);
    expect(netSalesOf(d)).toBe(180);
    expect(d.shippingCharged).toBe(10);
    expect(d.taxes).toBe(20);
    expect(d.orders).toBe(1);
    expect(d.productCost).toBe(60);
    expect(d.unitsMissingCost).toBe(0);
  });

  it("reports a full refund on the refund date, not the order date", () => {
    const o = order({
      refunds: [{ localDate: "2026-10-03", totalRefunded: 230, shippingRefunded: 10, lines: [{ lineItemId: "L1", quantity: 2, subtotal: 200, totalTax: 20, restockType: "RETURN" }] }],
    });
    const { days } = buildLedger([o], cost({ V1: 30 }));
    expect(netSalesOf(days.get("2026-10-01")!)).toBe(200);
    const r = days.get("2026-10-03")!;
    expect(r.returns).toBe(200);
    expect(r.refundedAmount).toBe(230);
    expect(r.taxes).toBe(-20);
    expect(r.shippingCharged).toBe(-10);
    expect(r.productCost).toBe(-60); // restocked → cost reversed
    expect(netSalesOf(r)).toBe(-200);
  });

  it("handles partial refunds", () => {
    const o = order({
      refunds: [{ localDate: "2026-10-02", totalRefunded: 110, shippingRefunded: 0, lines: [{ lineItemId: "L1", quantity: 1, subtotal: 100, totalTax: 10, restockType: "NO_RESTOCK" }] }],
    });
    const { days } = buildLedger([o], cost({ V1: 30 }));
    const r = days.get("2026-10-02")!;
    expect(r.returns).toBe(100);
    expect(r.productCost).toBe(0); // not restocked → cost stays
    const total = netSalesOf(days.get("2026-10-01")!) + netSalesOf(r);
    expect(total).toBe(100);
  });

  it("does not double count refunds: multiple refunds sum once each", () => {
    const o = order({
      refunds: [
        { localDate: "2026-10-02", totalRefunded: 55, shippingRefunded: 0, lines: [{ lineItemId: "L1", quantity: 1, subtotal: 50, totalTax: 5, restockType: null }] },
        { localDate: "2026-10-02", totalRefunded: 55, shippingRefunded: 0, lines: [{ lineItemId: "L1", quantity: 0, subtotal: 50, totalTax: 5, restockType: null }] },
      ],
    });
    const d = buildLedger([o], cost({})).days.get("2026-10-02")!;
    expect(d.returns).toBe(100);
    expect(d.refundedAmount).toBe(110);
  });

  it("reverses a cancelled, unpaid order on the cancellation date", () => {
    const o = order({ financialStatus: "VOIDED", cancelledLocalDate: "2026-10-02" });
    const { days } = buildLedger([o], cost({ V1: 30 }));
    const d1 = days.get("2026-10-01")!;
    const d2 = days.get("2026-10-02")!;
    expect(netSalesOf(d1) + netSalesOf(d2)).toBe(0);
    expect(d1.productCost + d2.productCost).toBe(0);
    expect(d1.taxes + d2.taxes).toBe(0);
    expect(d1.shippingCharged + d2.shippingCharged).toBe(0);
    expect(d1.feeOrders).toBe(0); // voided → no payment fee
    expect(d1.orderTotals).toBe(0); // …neither the percentage part
    expect(d1.cancelledOrders).toBe(1);
  });

  it("a cancelled and fully refunded order is not reversed twice", () => {
    const o = order({
      cancelledLocalDate: "2026-10-02",
      refunds: [{ localDate: "2026-10-02", totalRefunded: 230, shippingRefunded: 10, lines: [{ lineItemId: "L1", quantity: 2, subtotal: 200, totalTax: 20, restockType: "CANCEL" }] }],
    });
    const d2 = buildLedger([o], cost({ V1: 30 })).days.get("2026-10-02")!;
    expect(d2.returns).toBe(200);
    expect(d2.productCost).toBe(-60);
  });

  it("excludes test orders and gift cards", () => {
    const t = order({ test: true });
    const g = order({
      externalId: "1002",
      lines: [{ id: "G", productExternalId: "GC", variantExternalId: "GC", sku: null, title: "Gift card", quantity: 1, originalUnitPrice: 50, totalDiscount: 0, shopifyUnitCost: null, isGiftCard: true }],
    });
    const d = buildLedger([t, g], cost({})).days.get("2026-10-01")!;
    expect(d.grossSales).toBe(0);
    expect(d.orders).toBe(1);
    expect(d.unitsMissingCost).toBe(0);
  });

  it("flags missing product costs instead of assuming zero", () => {
    const d = buildLedger([order()], cost({})).days.get("2026-10-01")!;
    expect(d.productCost).toBe(0);
    expect(d.unitsMissingCost).toBe(2);
  });

  it("attributes UTM-matched orders to the campaign", () => {
    const { campaigns } = buildLedger([order({ attributedCampaignId: "C1" })], cost({ V1: 30 }));
    expect(campaigns.get("2026-10-01|C1")).toEqual({ orders: 1, netSales: 200, productCost: 60, unitsMissingCost: 0, orderTotals: 230, shippingCharged: 10, feeOrders: 1 });
  });

  it("builds product-level rows", () => {
    const { products } = buildLedger([order()], cost({ V1: 30 }));
    expect(products.get("2026-10-01|P1")).toMatchObject({ unitsSold: 2, grossSales: 200, productCost: 60 });
  });
});
