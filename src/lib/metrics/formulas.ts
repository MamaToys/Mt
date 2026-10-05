/**
 * Financial formulas. Every function returns `null` instead of Infinity/NaN
 * when a denominator is zero or an input is unavailable, so the UI can render
 * "N/A" rather than a misleading number. See docs/METRICS.md.
 */

export type Num = number | null | undefined;

const isNum = (v: Num): v is number => typeof v === "number" && Number.isFinite(v);

export function safeDiv(numerator: Num, denominator: Num): number | null {
  if (!isNum(numerator) || !isNum(denominator) || denominator === 0) return null;
  const r = numerator / denominator;
  return Number.isFinite(r) ? r : null;
}

/** Round half away from zero to `dp` decimals (avoids 1.005 → 1.00). */
export function round(v: number, dp = 2): number {
  // Exponent-string shifting avoids binary float artefacts (1.005 * 100 = 100.49999…).
  const shifted = Math.round(Number(`${Math.abs(v)}e${dp}`));
  return Math.sign(v) * Number(`${shifted}e-${dp}`);
}

/** AOV = Net Sales / Orders */
export const aov = (netSales: Num, orders: Num) => safeDiv(netSales, orders);

/** Shopify ROAS = Shopify Net Sales / Meta Spend */
export const shopifyRoas = (netSales: Num, metaSpend: Num) => safeDiv(netSales, metaSpend);

/** Meta ROAS = Meta-attributed purchase conversion value / Meta Spend */
export const metaRoas = (metaPurchaseValue: Num, metaSpend: Num) => safeDiv(metaPurchaseValue, metaSpend);

/** Profit ROAS = Net Profit / Meta Spend */
export const profitRoas = (netProfit: Num, metaSpend: Num) => safeDiv(netProfit, metaSpend);

/** CPA (blended) = Meta Spend / Shopify Orders */
export const cpa = (metaSpend: Num, orders: Num) => safeDiv(metaSpend, orders);

/** Meta CPA = Meta Spend / Meta-reported purchases */
export const metaCpa = (metaSpend: Num, metaPurchases: Num) => safeDiv(metaSpend, metaPurchases);

/** Percentage helper: a / b × 100 */
export const pct = (a: Num, b: Num) => {
  const r = safeDiv(a, b);
  return r === null ? null : r * 100;
};

/** Net Profit Margin % = Net Profit / Net Sales × 100 */
export const profitMargin = (netProfit: Num, netSales: Num) => pct(netProfit, netSales);

/** Ad Spend % = Meta Spend / Net Sales × 100 */
export const adSpendPct = (metaSpend: Num, netSales: Num) => pct(metaSpend, netSales);

export const ctr = (clicks: Num, impressions: Num) => pct(clicks, impressions);
export const cpc = (spend: Num, clicks: Num) => safeDiv(spend, clicks);
export const cpm = (spend: Num, impressions: Num) => {
  const r = safeDiv(spend, impressions);
  return r === null ? null : r * 1000;
};

/** Percentage change from `previous` to `current`. Null when previous is 0/unavailable. */
export function pctChange(current: Num, previous: Num): number | null {
  if (!isNum(current) || !isNum(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Discrepancy % = (Meta − Shopify) / Shopify × 100 */
export const discrepancyPct = (metaValue: Num, shopifyValue: Num) =>
  isNum(metaValue) && isNum(shopifyValue) ? pct(metaValue - shopifyValue, shopifyValue) : null;

export interface ProfitInputs {
  netSales: Num;
  productCost: Num;
  metaSpend: Num;
  shippingCost: Num;
  paymentFees: Num;
  otherExpenses: Num;
}

/**
 * Net Profit = Net Sales − Product Cost − Meta Spend − Shipping Costs − Payment Fees − Other Expenses.
 * Returns null if any component is unavailable — missing data is never treated as zero.
 */
export function netProfit(i: ProfitInputs): number | null {
  const parts = [i.netSales, i.productCost, i.metaSpend, i.shippingCost, i.paymentFees, i.otherExpenses];
  if (!parts.every(isNum)) return null;
  return (i.netSales as number) - (i.productCost as number) - (i.metaSpend as number) -
    (i.shippingCost as number) - (i.paymentFees as number) - (i.otherExpenses as number);
}

/**
 * Contribution margin before advertising (0–1):
 * (Net Sales − Product Cost − Shipping Costs − Payment Fees − Variable Expenses) / Net Sales
 * Fixed overheads (rent, software, …) are excluded: they don't scale with each sale.
 */
export function contributionMargin(i: {
  netSales: Num;
  productCost: Num;
  shippingCost: Num;
  paymentFees: Num;
  variableExpenses: Num;
}): number | null {
  if (![i.netSales, i.productCost, i.shippingCost, i.paymentFees, i.variableExpenses].every(isNum)) return null;
  const contribution =
    (i.netSales as number) - (i.productCost as number) - (i.shippingCost as number) -
    (i.paymentFees as number) - (i.variableExpenses as number);
  return safeDiv(contribution, i.netSales);
}

/**
 * Break-even ROAS = (1 + ad overhead rate) / Contribution Margin.
 * `adOverheadRate` covers costs that scale with ad spend (e.g. an agency
 * charging 10 % of spend → 0.10). Null when the margin is ≤ 0, i.e. no ROAS
 * can break even.
 */
export function breakEvenRoas(contributionMarginRatio: Num, adOverheadRate = 0): number | null {
  if (!isNum(contributionMarginRatio) || contributionMarginRatio <= 0) return null;
  return (1 + adOverheadRate) / contributionMarginRatio;
}

export type BreakEvenStatus = "above" | "below" | "at" | "unknown";

export function breakEvenStatus(currentRoas: Num, breakEven: Num): BreakEvenStatus {
  if (!isNum(currentRoas) || !isNum(breakEven)) return "unknown";
  const diff = round(currentRoas, 2) - round(breakEven, 2);
  if (diff > 0) return "above";
  if (diff < 0) return "below";
  return "at";
}
