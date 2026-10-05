/**
 * Simple run-rate forecast for the current month. Clearly a FORECAST:
 * month-to-date actuals (complete days only) + average of the last N complete
 * days × remaining days. Returns null when the basis data is incomplete.
 */
import { DailyRow } from "./aggregate";
import { DateStr, addDays, daysInMonth, diffDays, endOfMonth, startOfMonth } from "./dates";

export interface Forecast {
  month: string;
  basisDays: number;
  daysRemaining: number;
  netSales: { actual: number; forecast: number } | null;
  metaSpend: { actual: number; forecast: number } | null;
  netProfit: { actual: number; forecast: number } | null;
}

export function monthForecast(rows: DailyRow[], today: DateStr, basisDays = 14): Forecast {
  const yesterday = addDays(today, -1);
  const monthStart = startOfMonth(today);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const daysRemaining = diffDays(yesterday, endOfMonth(today)); // includes today
  const sumField = (from: DateStr, to: DateStr, f: (r: DailyRow) => number | null): number | null => {
    let s = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const r = byDate.get(d);
      const v = r ? f(r) : null;
      if (v === null) return null;
      s += v;
    }
    return s;
  };
  const profitOf = (r: DailyRow) =>
    [r.netSales, r.productCost, r.metaSpend, r.shippingCost, r.paymentFees, r.otherExpenses].some((v) => v === null)
      ? null
      : r.netSales! - r.productCost! - r.metaSpend! - r.shippingCost! - r.paymentFees! - r.otherExpenses!;
  const basisFrom = addDays(yesterday, -(basisDays - 1));
  const make = (f: (r: DailyRow) => number | null) => {
    const actual = monthStart <= yesterday ? sumField(monthStart, yesterday, f) : 0;
    const basis = sumField(basisFrom, yesterday, f);
    if (actual === null || basis === null) return null;
    return { actual, forecast: actual + (basis / basisDays) * daysRemaining };
  };
  return {
    month: today.slice(0, 7),
    basisDays,
    daysRemaining: Math.min(daysRemaining, daysInMonth(today)),
    netSales: make((r) => r.netSales),
    metaSpend: make((r) => r.metaSpend),
    netProfit: make(profitOf),
  };
}
