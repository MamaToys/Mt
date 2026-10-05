/**
 * Allocation of user-configured expenses and modelled costs to individual days.
 *
 * - FIXED + ONE_TIME : full amount on startDate.
 * - FIXED + DAILY    : amount on every day in [startDate, endDate].
 * - FIXED + MONTHLY  : amount ÷ days-in-that-month on every day in [startDate, endDate].
 * - PERCENTAGE       : percent × base metric of that day (base = net sales,
 *                      gross sales, total sales or Meta spend). ONE_TIME
 *                      percentage expenses apply only on startDate.
 *
 * Percentage expenses are "variable" (they scale with sales or spend) and
 * therefore count against contribution margin / break-even ROAS. Fixed
 * expenses are overheads and do not.
 */
import { DateStr, daysInMonth } from "./dates";

export type ExpenseType = "FIXED" | "PERCENTAGE";
export type ExpenseFrequency = "ONE_TIME" | "DAILY" | "MONTHLY";
export type PercentBase = "NET_SALES" | "GROSS_SALES" | "TOTAL_SALES" | "META_SPEND";

export interface ExpenseDef {
  id: string;
  name: string;
  category: string;
  type: ExpenseType;
  frequency: ExpenseFrequency;
  amount: number | null;
  percent: number | null; // 0–100
  percentBase: PercentBase | null;
  startDate: DateStr;
  endDate: DateStr | null;
}

export interface DayBases {
  netSales: number | null;
  grossSales: number | null;
  totalSales: number | null;
  metaSpend: number | null;
}

export interface DayExpenseAllocation {
  total: number | null; // null if a percentage base was unavailable
  fixed: number;
  /** Percentage expenses based on sales. */
  variable: number | null;
  /** Percentage expenses based on Meta spend (ad overhead, e.g. agency %). */
  adLinked: number | null;
  /** Σ percent of META_SPEND-based expenses active on the day, as a rate (0.1 = 10 %). */
  adOverheadRate: number;
  byCategory: Record<string, number>;
}

export function isActiveOn(e: ExpenseDef, d: DateStr): boolean {
  if (e.frequency === "ONE_TIME") return d === e.startDate;
  return d >= e.startDate && (e.endDate === null || d <= e.endDate);
}

export function allocateExpensesForDay(expenses: ExpenseDef[], d: DateStr, bases: DayBases): DayExpenseAllocation {
  let fixed = 0;
  let variable: number | null = 0;
  let adLinked: number | null = 0;
  let adOverheadRate = 0;
  const byCategory: Record<string, number> = {};
  let unavailable = false;

  for (const e of expenses) {
    if (!isActiveOn(e, d)) continue;
    let value: number | null = 0;
    if (e.type === "FIXED") {
      if (e.amount === null) {
        // Amount unavailable (e.g. no exchange rate for its currency) — never assume 0.
        unavailable = true;
        continue;
      }
      value = e.frequency === "MONTHLY" ? e.amount / daysInMonth(d) : e.amount;
      fixed += value;
    } else {
      const rate = (e.percent ?? 0) / 100;
      const base =
        e.percentBase === "GROSS_SALES" ? bases.grossSales
        : e.percentBase === "TOTAL_SALES" ? bases.totalSales
        : e.percentBase === "META_SPEND" ? bases.metaSpend
        : bases.netSales;
      value = base === null ? null : rate * base;
      if (e.percentBase === "META_SPEND") {
        adOverheadRate += rate;
        adLinked = adLinked === null || value === null ? null : adLinked + value;
      } else {
        variable = variable === null || value === null ? null : variable + value;
      }
    }
    if (value !== null) byCategory[e.category] = (byCategory[e.category] ?? 0) + value;
  }

  const total = unavailable || variable === null || adLinked === null ? null : fixed + variable + adLinked;
  return { total, fixed, variable, adLinked, adOverheadRate, byCategory };
}

export type ShippingCostMode = "NONE" | "PER_ORDER" | "EQUAL_TO_CHARGED" | "PERCENT_OF_NET_SALES";

export interface CostSettings {
  paymentFeePercent: number; // 0–100
  paymentFeeFixed: number;
  shippingCostMode: ShippingCostMode;
  shippingCostPerOrder: number;
  shippingCostPercent: number; // 0–100
}

/** Payment fees = percent × Σ order totals + fixed × orders charged. */
export function paymentFeesForDay(s: CostSettings, orderTotals: number, feeOrders: number): number {
  return (s.paymentFeePercent / 100) * orderTotals + s.paymentFeeFixed * feeOrders;
}

/** Fulfilment shipping cost paid by the store, per the configured model. */
export function shippingCostForDay(
  s: CostSettings,
  d: { orders: number; shippingCharged: number; netSales: number },
): number {
  switch (s.shippingCostMode) {
    case "NONE":
      return 0;
    case "PER_ORDER":
      return s.shippingCostPerOrder * d.orders;
    case "EQUAL_TO_CHARGED":
      return Math.max(0, d.shippingCharged);
    case "PERCENT_OF_NET_SALES":
      return (s.shippingCostPercent / 100) * d.netSales;
  }
}
