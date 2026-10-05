/**
 * Turns Shopify orders + refunds into per-day sales ledger entries, following
 * Shopify's own sales-report conventions (see docs/METRICS.md):
 *
 * - Gross sales   = Σ line item original unit price × quantity (gift cards excluded),
 *                   reported on the order's processed date.
 * - Discounts     = Σ line item discount allocations, on the order date.
 * - Returns       = Σ refunded line item subtotals, reported on the REFUND date
 *                   (not the order date) — the same as Shopify.
 *                   A cancelled order whose items were not (fully) refunded — e.g. an
 *                   unpaid order that was voided — has the remainder reversed on
 *                   the cancellation date, so it nets to zero.
 * - Net sales     = Gross sales − Discounts − Returns.
 * - Shipping/Tax  = charged on the order date, minus refunded amounts on the refund date.
 * - Total sales   = Net sales + Shipping + Taxes.
 *
 * Each order contributes exactly once per date (keyed by Shopify order ID upstream),
 * so re-syncing an order replaces — never adds to — its contribution.
 */
import { DateStr } from "./dates";

export interface LedgerLine {
  id: string; // internal line item id
  productExternalId: string | null;
  variantExternalId: string | null;
  sku: string | null;
  title: string;
  quantity: number;
  originalUnitPrice: number;
  totalDiscount: number;
  shopifyUnitCost: number | null;
  isGiftCard: boolean;
}

export interface LedgerRefundLine {
  lineItemId: string;
  quantity: number;
  subtotal: number;
  totalTax: number;
  restockType: string | null;
}

export interface LedgerRefund {
  localDate: DateStr;
  totalRefunded: number;
  shippingRefunded: number;
  lines: LedgerRefundLine[];
}

export interface LedgerOrder {
  externalId: string;
  localDate: DateStr;
  test: boolean;
  financialStatus: string | null;
  cancelledLocalDate: DateStr | null;
  totalPrice: number;
  totalShipping: number;
  totalTax: number;
  attributedCampaignId: string | null;
  lines: LedgerLine[];
  refunds: LedgerRefund[];
}

/** Returns cost per unit for a line on a date, or null if unknown. */
export type CostResolver = (line: Pick<LedgerLine, "variantExternalId" | "sku" | "shopifyUnitCost">, date: DateStr) => number | null;

export interface DayLedger {
  grossSales: number;
  discounts: number;
  returns: number;
  shippingCharged: number;
  taxes: number;
  refundedAmount: number;
  orders: number;
  cancelledOrders: number;
  refundedOrders: number;
  unitsSold: number;
  productCost: number;
  unitsMissingCost: number;
  /** Σ order totals of orders placed (basis for payment fees). */
  orderTotals: number;
  /** Orders that incur a payment fee (not voided). */
  feeOrders: number;
}

export const emptyDay = (): DayLedger => ({
  grossSales: 0,
  discounts: 0,
  returns: 0,
  shippingCharged: 0,
  taxes: 0,
  refundedAmount: 0,
  orders: 0,
  cancelledOrders: 0,
  refundedOrders: 0,
  unitsSold: 0,
  productCost: 0,
  unitsMissingCost: 0,
  orderTotals: 0,
  feeOrders: 0,
});

export interface ProductDay {
  productExternalId: string;
  title: string;
  unitsSold: number;
  unitsReturned: number;
  grossSales: number;
  discounts: number;
  returns: number;
  productCost: number;
  unitsMissingCost: number;
}

/** Restock types for which the unit is back in inventory (cost reversed). */
const RESTOCKED = new Set(["RETURN", "CANCEL", "LEGACY_RESTOCK"]);

const NO_FEE_STATUSES = new Set(["VOIDED", "EXPIRED"]);

export interface LedgerResult {
  days: Map<DateStr, DayLedger>;
  products: Map<string, ProductDay>; // key `${date}|${productId}`
  campaigns: Map<string, { orders: number; netSales: number; productCost: number; unitsMissingCost: number }>; // key `${date}|${campaignId}`
}

export function buildLedger(orders: LedgerOrder[], costOf: CostResolver): LedgerResult {
  const days = new Map<DateStr, DayLedger>();
  const products = new Map<string, ProductDay>();
  const campaigns = new Map<string, { orders: number; netSales: number; productCost: number; unitsMissingCost: number }>();

  const day = (d: DateStr) => {
    let v = days.get(d);
    if (!v) days.set(d, (v = emptyDay()));
    return v;
  };
  const prod = (d: DateStr, l: LedgerLine) => {
    const pid = l.productExternalId ?? `unknown:${l.title}`;
    const k = `${d}|${pid}`;
    let v = products.get(k);
    if (!v) {
      products.set(k, (v = {
        productExternalId: pid, title: l.title, unitsSold: 0, unitsReturned: 0,
        grossSales: 0, discounts: 0, returns: 0, productCost: 0, unitsMissingCost: 0,
      }));
    }
    return v;
  };
  const camp = (d: DateStr, id: string) => {
    const k = `${d}|${id}`;
    let v = campaigns.get(k);
    if (!v) campaigns.set(k, (v = { orders: 0, netSales: 0, productCost: 0, unitsMissingCost: 0 }));
    return v;
  };

  for (const o of orders) {
    if (o.test) continue; // test orders are never reported
    const d0 = day(o.localDate);
    const lineById = new Map(o.lines.map((l) => [l.id, l]));
    const campaignId = o.attributedCampaignId;

    d0.orders += 1;
    d0.orderTotals += o.totalPrice;
    if (!NO_FEE_STATUSES.has((o.financialStatus ?? "").toUpperCase())) d0.feeOrders += 1;
    d0.shippingCharged += o.totalShipping;
    d0.taxes += o.totalTax;
    if (o.cancelledLocalDate) d0.cancelledOrders += 1;
    if (o.refunds.length > 0) d0.refundedOrders += 1;

    let orderNet = 0;
    let orderCost = 0;
    let orderMissing = 0;
    const netByLine = new Map<string, number>();
    const unreturnedQty = new Map<string, number>();

    for (const l of o.lines) {
      if (l.isGiftCard) continue; // gift cards are a liability, not a sale
      const gross = l.originalUnitPrice * l.quantity;
      d0.grossSales += gross;
      d0.discounts += l.totalDiscount;
      d0.unitsSold += l.quantity;
      netByLine.set(l.id, gross - l.totalDiscount);
      unreturnedQty.set(l.id, l.quantity);
      orderNet += gross - l.totalDiscount;

      const p = prod(o.localDate, l);
      p.unitsSold += l.quantity;
      p.grossSales += gross;
      p.discounts += l.totalDiscount;

      const unitCost = costOf(l, o.localDate);
      if (unitCost === null) {
        d0.unitsMissingCost += l.quantity;
        p.unitsMissingCost += l.quantity;
        orderMissing += l.quantity;
      } else {
        d0.productCost += unitCost * l.quantity;
        p.productCost += unitCost * l.quantity;
        orderCost += unitCost * l.quantity;
      }
    }

    if (campaignId) {
      const c = camp(o.localDate, campaignId);
      c.orders += 1;
      c.netSales += orderNet;
      c.productCost += orderCost;
      c.unitsMissingCost += orderMissing;
    }

    let refundedTax = 0;
    let refundedShipping = 0;
    for (const r of o.refunds) {
      const dr = day(r.localDate);
      dr.refundedAmount += r.totalRefunded;
      dr.shippingCharged -= r.shippingRefunded;
      refundedShipping += r.shippingRefunded;
      let refundReturns = 0;
      let refundCostReversal = 0;
      let refundMissingReversal = 0;
      for (const rl of r.lines) {
        const l = lineById.get(rl.lineItemId);
        if (!l || l.isGiftCard) continue;
        dr.returns += rl.subtotal;
        dr.taxes -= rl.totalTax;
        refundedTax += rl.totalTax;
        refundReturns += rl.subtotal;
        netByLine.set(l.id, (netByLine.get(l.id) ?? 0) - rl.subtotal);
        unreturnedQty.set(l.id, (unreturnedQty.get(l.id) ?? 0) - rl.quantity);

        const p = prod(r.localDate, l);
        p.returns += rl.subtotal;
        p.unitsReturned += rl.quantity;

        if (RESTOCKED.has((rl.restockType ?? "").toUpperCase())) {
          const unitCost = costOf(l, o.localDate);
          if (unitCost === null) {
            dr.unitsMissingCost -= rl.quantity;
            p.unitsMissingCost -= rl.quantity;
            refundMissingReversal += rl.quantity;
          } else {
            dr.productCost -= unitCost * rl.quantity;
            p.productCost -= unitCost * rl.quantity;
            refundCostReversal += unitCost * rl.quantity;
          }
        }
      }
      if (campaignId) {
        const c = camp(r.localDate, campaignId);
        c.netSales -= refundReturns;
        c.productCost -= refundCostReversal;
        c.unitsMissingCost -= refundMissingReversal;
      }
    }

    // Cancelled but not (fully) refunded → reverse the remainder on the cancellation date.
    if (o.cancelledLocalDate) {
      const dc = day(o.cancelledLocalDate);
      let remainder = 0;
      let costReversal = 0;
      let missingReversal = 0;
      for (const l of o.lines) {
        if (l.isGiftCard) continue;
        const rem = netByLine.get(l.id) ?? 0;
        const qty = Math.max(0, unreturnedQty.get(l.id) ?? 0);
        if (rem > 0.005) {
          remainder += rem;
          const p = prod(o.cancelledLocalDate, l);
          p.returns += rem;
          p.unitsReturned += qty;
          const unitCost = costOf(l, o.localDate);
          if (unitCost === null) {
            missingReversal += qty;
            p.unitsMissingCost -= qty;
          } else {
            costReversal += unitCost * qty;
            p.productCost -= unitCost * qty;
          }
        }
      }
      if (remainder > 0) {
        dc.returns += remainder;
        dc.productCost -= costReversal;
        dc.unitsMissingCost -= missingReversal;
        const remTax = Math.max(0, o.totalTax - refundedTax);
        const remShip = Math.max(0, o.totalShipping - refundedShipping);
        dc.taxes -= remTax;
        dc.shippingCharged -= remShip;
        if (campaignId) {
          const c = camp(o.cancelledLocalDate, campaignId);
          c.netSales -= remainder;
          c.productCost -= costReversal;
          c.unitsMissingCost -= missingReversal;
        }
      }
    }
  }

  return { days, products, campaigns };
}

export function netSalesOf(d: Pick<DayLedger, "grossSales" | "discounts" | "returns">): number {
  return d.grossSales - d.discounts - d.returns;
}
