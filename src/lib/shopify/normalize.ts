/**
 * Pure conversion of Shopify GraphQL order payloads into database records.
 * All money is shop currency (shopMoney). Dates are bucketed in the store timezone.
 */
import { localDateOf, localHourOf } from "../metrics/dates";

type Money = { shopMoney: { amount: string; currencyCode?: string } } | null | undefined;

export interface GqlLineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  isGiftCard: boolean;
  product: { id: string } | null;
  variant: { id: string; inventoryItem: { unitCost: { amount: string } | null } | null } | null;
  originalUnitPriceSet: Money;
  discountAllocations: { allocatedAmountSet: Money }[];
}

export interface GqlRefund {
  id: string;
  createdAt: string;
  note: string | null;
  totalRefundedSet: Money;
  refundShippingLines?: { nodes: { subtotalAmountSet: Money }[] };
  refundLineItems: {
    pageInfo?: { hasNextPage: boolean };
    nodes: {
      id: string;
      quantity: number;
      restockType: string | null;
      lineItem: { id: string } | null;
      subtotalSet: Money;
      totalTaxSet: Money;
    }[];
  };
}

export interface GqlOrder {
  id: string;
  name: string;
  number?: number | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  closedAt: string | null;
  test: boolean;
  sourceName: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  currencyCode: string;
  subtotalPriceSet: Money;
  totalPriceSet: Money;
  totalDiscountsSet: Money;
  totalTaxSet: Money;
  totalShippingPriceSet: Money;
  totalRefundedSet: Money;
  netPaymentSet: Money;
  currentTotalPriceSet: Money;
  customerJourneySummary?: {
    lastVisit?: {
      landingPage?: string | null;
      utmParameters?: { source?: string | null; medium?: string | null; campaign?: string | null; term?: string | null; content?: string | null } | null;
    } | null;
  } | null;
  lineItems: { nodes: GqlLineItem[] };
  refunds: GqlRefund[];
}

export const money = (m: Money): number => {
  const v = Number(m?.shopMoney?.amount ?? 0);
  return Number.isFinite(v) ? v : 0;
};
const moneyOrNull = (m: Money): number | null => (m?.shopMoney ? money(m) : null);
const gid = (g: string | null | undefined) => (g ? (/\/(\d+)$/.exec(g)?.[1] ?? g) : null);

export interface NormalizedLine {
  externalId: string;
  productExternalId: string | null;
  variantExternalId: string | null;
  sku: string | null;
  title: string;
  variantTitle: string | null;
  quantity: number;
  originalUnitPrice: number;
  totalDiscount: number;
  shopifyUnitCost: number | null;
  isGiftCard: boolean;
}

export interface NormalizedRefund {
  externalId: string;
  processedAt: Date;
  localDate: string;
  totalRefunded: number;
  lineItemsSubtotal: number;
  lineItemsTax: number;
  shippingRefunded: number;
  note: string | null;
  lines: { externalId: string; lineItemExternalId: string; quantity: number; subtotal: number; totalTax: number; restockType: string | null }[];
}

export interface NormalizedOrder {
  externalId: string;
  orderNumber: number | null;
  name: string;
  processedAt: Date;
  createdAtShopify: Date;
  updatedAtShopify: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  closedAt: Date | null;
  test: boolean;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  currency: string;
  localDate: string;
  localHour: number;
  grossSales: number;
  totalDiscounts: number;
  subtotalPrice: number;
  totalShipping: number;
  totalTax: number;
  totalPrice: number;
  totalRefunded: number;
  netPayment: number | null;
  currentTotalPrice: number | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  landingPage: string | null;
  sourceName: string | null;
  lines: NormalizedLine[];
  refunds: NormalizedRefund[];
}

const trimOrNull = (s: string | null | undefined, max = 500) => (s && s.trim() ? s.trim().slice(0, max) : null);

export function normalizeOrder(o: GqlOrder, timeZone: string): NormalizedOrder {
  // Shopify's sales reports use processedAt (falls back to createdAt).
  const processedAt = new Date(o.processedAt ?? o.createdAt);
  const lines: NormalizedLine[] = o.lineItems.nodes.map((l) => ({
    externalId: gid(l.id)!,
    productExternalId: gid(l.product?.id),
    variantExternalId: gid(l.variant?.id),
    sku: trimOrNull(l.sku, 255),
    title: l.title,
    variantTitle: trimOrNull(l.variantTitle, 255),
    quantity: l.quantity,
    originalUnitPrice: money(l.originalUnitPriceSet),
    totalDiscount: l.discountAllocations.reduce((s, d) => s + money(d.allocatedAmountSet), 0),
    shopifyUnitCost: l.variant?.inventoryItem?.unitCost ? Number(l.variant.inventoryItem.unitCost.amount) : null,
    isGiftCard: l.isGiftCard,
  }));
  const giftCardLineIds = new Set(lines.filter((l) => l.isGiftCard).map((l) => l.externalId));

  const refunds: NormalizedRefund[] = (o.refunds ?? []).map((r) => {
    const rl = r.refundLineItems.nodes.map((n) => ({
      externalId: gid(n.id)!,
      lineItemExternalId: gid(n.lineItem?.id) ?? "",
      quantity: n.quantity,
      subtotal: money(n.subtotalSet),
      totalTax: money(n.totalTaxSet),
      restockType: n.restockType,
    }));
    const merch = rl.filter((x) => !giftCardLineIds.has(x.lineItemExternalId));
    const at = new Date(r.createdAt);
    return {
      externalId: gid(r.id)!,
      processedAt: at,
      localDate: localDateOf(at, timeZone),
      totalRefunded: money(r.totalRefundedSet),
      lineItemsSubtotal: merch.reduce((s, x) => s + x.subtotal, 0),
      lineItemsTax: merch.reduce((s, x) => s + x.totalTax, 0),
      shippingRefunded: (r.refundShippingLines?.nodes ?? []).reduce((s, x) => s + money(x.subtotalAmountSet), 0),
      note: trimOrNull(r.note, 1000),
      lines: rl,
    };
  });

  const utm = o.customerJourneySummary?.lastVisit?.utmParameters;
  return {
    externalId: gid(o.id)!,
    orderNumber: o.number ?? (Number(o.name.replace(/\D/g, "")) || null),
    name: o.name,
    processedAt,
    createdAtShopify: new Date(o.createdAt),
    updatedAtShopify: new Date(o.updatedAt),
    cancelledAt: o.cancelledAt ? new Date(o.cancelledAt) : null,
    cancelReason: o.cancelReason,
    closedAt: o.closedAt ? new Date(o.closedAt) : null,
    test: o.test,
    financialStatus: o.displayFinancialStatus,
    fulfillmentStatus: o.displayFulfillmentStatus,
    currency: o.totalPriceSet?.shopMoney?.currencyCode ?? o.currencyCode,
    localDate: localDateOf(processedAt, timeZone),
    localHour: localHourOf(processedAt, timeZone),
    grossSales: lines.filter((l) => !l.isGiftCard).reduce((s, l) => s + l.originalUnitPrice * l.quantity, 0),
    totalDiscounts: money(o.totalDiscountsSet),
    subtotalPrice: money(o.subtotalPriceSet),
    totalShipping: money(o.totalShippingPriceSet),
    totalTax: money(o.totalTaxSet),
    totalPrice: money(o.totalPriceSet),
    totalRefunded: money(o.totalRefundedSet),
    netPayment: moneyOrNull(o.netPaymentSet),
    currentTotalPrice: moneyOrNull(o.currentTotalPriceSet),
    utmSource: trimOrNull(utm?.source),
    utmMedium: trimOrNull(utm?.medium),
    utmCampaign: trimOrNull(utm?.campaign),
    utmTerm: trimOrNull(utm?.term),
    utmContent: trimOrNull(utm?.content),
    landingPage: trimOrNull(o.customerJourneySummary?.lastVisit?.landingPage, 2000),
    sourceName: o.sourceName,
    lines,
    refunds,
  };
}
