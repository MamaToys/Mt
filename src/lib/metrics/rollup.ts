/**
 * Pure daily rollup: combines the Shopify ledger, Meta daily totals (already
 * converted to store currency), modelled costs and expenses into one DailyRow
 * per store-local date. The DB job in lib/sync/rollup.ts persists these rows.
 */
import { DailyRow } from "./aggregate";
import { DayLedger, emptyDay, netSalesOf } from "./accounting";
import { DateStr } from "./dates";
import { CostSettings, ExpenseDef, allocateExpensesForDay, paymentFeesForDay, shippingCostForDay } from "./expenses";

export interface MetaDay {
  spend: number | null; // null when FX conversion failed
  purchases: number;
  purchaseValue: number | null;
  impressions: number;
  clicks: number;
  linkClicks: number;
  fxMissing: boolean;
}

export interface RollupInput {
  dates: DateStr[];
  ledgerDays: Map<DateStr, DayLedger>;
  hasShopifyData: (d: DateStr) => boolean;
  metaDays: Map<DateStr, MetaDay>;
  hasMetaData: (d: DateStr) => boolean;
  expenses: ExpenseDef[];
  costSettings: CostSettings;
}

export function rollupDays(input: RollupInput): DailyRow[] {
  return input.dates.map((date) => {
    const hasShopify = input.hasShopifyData(date);
    const hasMeta = input.hasMetaData(date);
    const l = input.ledgerDays.get(date) ?? emptyDay();
    const m = input.metaDays.get(date);

    const netSales = hasShopify ? netSalesOf(l) : null;
    const totalSales = netSales === null ? null : netSales + l.shippingCharged + l.taxes;
    // A covered Meta day with no rows genuinely had zero delivery.
    const metaSpend = !hasMeta ? null : m ? m.spend : 0;
    const metaPurchaseValue = !hasMeta ? null : m ? m.purchaseValue : 0;

    const expenses = allocateExpensesForDay(input.expenses, date, {
      netSales,
      grossSales: hasShopify ? l.grossSales : null,
      totalSales,
      metaSpend,
    });

    const sv = <T,>(v: T) => (hasShopify ? v : null);
    const mv = <T,>(v: T) => (hasMeta ? v : null);

    return {
      date,
      hasShopifyData: hasShopify,
      hasMetaData: hasMeta,
      grossSales: sv(l.grossSales),
      discounts: sv(l.discounts),
      returns: sv(l.returns),
      netSales,
      shippingCharged: sv(l.shippingCharged),
      taxes: sv(l.taxes),
      totalSales,
      refundedAmount: sv(l.refundedAmount),
      orders: sv(l.orders),
      cancelledOrders: sv(l.cancelledOrders),
      refundedOrders: sv(l.refundedOrders),
      unitsSold: sv(l.unitsSold),
      productCost: sv(l.productCost),
      unitsMissingCost: sv(l.unitsMissingCost),
      shippingCost: hasShopify
        ? shippingCostForDay(input.costSettings, { orders: l.orders, shippingCharged: l.shippingCharged, netSales: netSales ?? 0 })
        : null,
      paymentFees: hasShopify ? paymentFeesForDay(input.costSettings, l.orderTotals, l.feeOrders) : null,
      otherExpenses: expenses.total,
      variableExpenses: expenses.variable,
      adLinkedExpenses: expenses.adLinked,
      metaSpend,
      metaPurchases: mv(m?.purchases ?? 0),
      metaPurchaseValue,
      metaImpressions: mv(m?.impressions ?? 0),
      metaClicks: mv(m?.clicks ?? 0),
      metaLinkClicks: mv(m?.linkClicks ?? 0),
      metaFxMissing: m?.fxMissing ?? false,
    };
  });
}
