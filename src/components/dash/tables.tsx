import type { Kpis } from "@/lib/metrics/aggregate";
import * as F from "@/lib/metrics/formulas";
import { formatChange, formatMoney, formatNumber, formatPct, formatRoas } from "@/lib/format";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface BucketRow {
  key: string;
  label: string;
  kpis: Kpis;
  complete: boolean; // false when any day lacks Shopify or Meta data
  /** Bucket covers only part of its week/month (range edge or today). */
  partial: boolean;
  /** At least one day in the bucket has Shopify or Meta data. */
  hasData: boolean;
}

function Label({ r }: { r: BucketRow }) {
  return (
    <>
      {r.label}
      {r.partial && <span className="ml-1 text-xs text-subtle">(partial)</span>}
      {!r.complete && <span className="ml-1 text-warning" title="Some source data unavailable in this period">⚠</span>}
    </>
  );
}

const otherCosts = (k: Kpis) =>
  k.shippingCost === null || k.paymentFees === null || k.otherExpenses === null ? null : k.shippingCost + k.paymentFees + k.otherExpenses;

function Change({ v, upIsGood = true }: { v: number | null; upIsGood?: boolean }) {
  if (v === null) return <span className="text-subtle">N/A</span>;
  const good = upIsGood ? v > 0 : v < 0;
  return <span className={cn(Math.abs(v) < 0.05 ? "text-muted-foreground" : good ? "text-good" : "text-critical")}>{formatChange(v)}</span>;
}

const R = "text-right";

export function DailyTable({ rows, currency }: { rows: BucketRow[]; currency: string }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Date</TH>
          <TH className={R}>Gross Sales</TH>
          <TH className={R}>Net Sales</TH>
          <TH className={R}>Orders</TH>
          <TH className={R}>AOV</TH>
          <TH className={R}>Meta Spend</TH>
          <TH className={R}>Meta Revenue</TH>
          <TH className={R}>Meta ROAS</TH>
          <TH className={R}>Shopify ROAS</TH>
          <TH className={R}>Product Cost</TH>
          <TH className={R}>Other Costs</TH>
          <TH className={R}>Net Profit</TH>
          <TH className={R}>Margin</TH>
        </TR>
      </THead>
      <TBody>
        {[...rows].reverse().map((r) => {
          const k = r.kpis;
          return (
            <TR key={r.key}>
              <TD className="font-medium"><Label r={r} /></TD>
              <TD className={R}>{formatMoney(k.grossSales, currency)}</TD>
              <TD className={cn(R, "font-medium")}>{formatMoney(k.netSales, currency)}</TD>
              <TD className={R}>{formatNumber(k.orders)}</TD>
              <TD className={R}>{formatMoney(k.aov, currency)}</TD>
              <TD className={R}>{formatMoney(k.metaSpend, currency)}</TD>
              <TD className={R}>{formatMoney(k.metaPurchaseValue, currency)}</TD>
              <TD className={R}>{formatRoas(k.metaRoas)}</TD>
              <TD className={R}>{formatRoas(k.shopifyRoas)}</TD>
              <TD className={R}>{formatMoney(k.productCost, currency)}{!k.productCostComplete && <span className="text-warning" title={`${k.unitsMissingCost} units missing cost`}>*</span>}</TD>
              <TD className={R}>{formatMoney(otherCosts(k), currency)}</TD>
              <TD className={cn(R, "font-medium", (k.netProfit ?? 0) < 0 && "text-critical")}>{formatMoney(k.netProfit, currency)}</TD>
              <TD className={R}>{formatPct(k.profitMargin)}</TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

export function WeeklyTable({ rows, currency }: { rows: BucketRow[]; currency: string }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Week</TH>
          <TH className={R}>Net Sales</TH>
          <TH className={R}>Orders</TH>
          <TH className={R}>Ad Spend</TH>
          <TH className={R}>Shopify ROAS</TH>
          <TH className={R}>CPA</TH>
          <TH className={R}>AOV</TH>
          <TH className={R}>Net Profit</TH>
          <TH className={R}>Margin</TH>
          <TH className={R}>Sales Δ</TH>
          <TH className={R}>Spend Δ</TH>
          <TH className={R}>Profit Δ</TH>
          <TH className={R}>ROAS Δ</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r, i) => ({ r, p: i > 0 && !r.partial && !rows[i - 1].partial ? rows[i - 1].kpis : null })).reverse().map(({ r, p }) => {
          const k = r.kpis;
          return (
            <TR key={r.key}>
              <TD className="font-medium"><Label r={r} /></TD>
              <TD className={R}>{formatMoney(k.netSales, currency)}</TD>
              <TD className={R}>{formatNumber(k.orders)}</TD>
              <TD className={R}>{formatMoney(k.metaSpend, currency)}</TD>
              <TD className={R}>{formatRoas(k.shopifyRoas)}</TD>
              <TD className={R}>{formatMoney(k.cpa, currency)}</TD>
              <TD className={R}>{formatMoney(k.aov, currency)}</TD>
              <TD className={cn(R, "font-medium")}>{formatMoney(k.netProfit, currency)}</TD>
              <TD className={R}>{formatPct(k.profitMargin)}</TD>
              <TD className={R}><Change v={p ? F.pctChange(k.netSales, p.netSales) : null} /></TD>
              <TD className={R}><Change v={p ? F.pctChange(k.metaSpend, p.metaSpend) : null} upIsGood={false} /></TD>
              <TD className={R}><Change v={p ? F.pctChange(k.netProfit, p.netProfit) : null} /></TD>
              <TD className={R}><Change v={p ? F.pctChange(k.shopifyRoas, p.shopifyRoas) : null} /></TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

export function MonthlyTable({ rows, currency }: { rows: BucketRow[]; currency: string }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Month</TH>
          <TH className={R}>Gross Sales</TH>
          <TH className={R}>Net Sales</TH>
          <TH className={R}>Orders</TH>
          <TH className={R}>Ad Spend</TH>
          <TH className={R}>Shopify ROAS</TH>
          <TH className={R}>Meta ROAS</TH>
          <TH className={R}>Product Cost</TH>
          <TH className={R}>Other Expenses</TH>
          <TH className={R}>Net Profit</TH>
          <TH className={R}>Net Margin</TH>
          <TH className={R}>Sales MoM</TH>
          <TH className={R}>Profit MoM</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r, i) => ({ r, p: i > 0 && !r.partial && !rows[i - 1].partial ? rows[i - 1].kpis : null })).reverse().map(({ r, p }) => {
          const k = r.kpis;
          return (
            <TR key={r.key}>
              <TD className="font-medium"><Label r={r} /></TD>
              <TD className={R}>{formatMoney(k.grossSales, currency)}</TD>
              <TD className={R}>{formatMoney(k.netSales, currency)}</TD>
              <TD className={R}>{formatNumber(k.orders)}</TD>
              <TD className={R}>{formatMoney(k.metaSpend, currency)}</TD>
              <TD className={R}>{formatRoas(k.shopifyRoas)}</TD>
              <TD className={R}>{formatRoas(k.metaRoas)}</TD>
              <TD className={R}>{formatMoney(k.productCost, currency)}</TD>
              <TD className={R}>{formatMoney(otherCosts(k), currency)}</TD>
              <TD className={cn(R, "font-medium")}>{formatMoney(k.netProfit, currency)}</TD>
              <TD className={R}>{formatPct(k.profitMargin)}</TD>
              <TD className={R}><Change v={p ? F.pctChange(k.netSales, p.netSales) : null} /></TD>
              <TD className={R}><Change v={p ? F.pctChange(k.netProfit, p.netProfit) : null} /></TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
