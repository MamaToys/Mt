"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatNumber, NA } from "@/lib/format";

export interface SeriesPoint {
  key: string;
  label: string;
  netSales: number | null;
  metaSpend: number | null;
  productCost: number | null;
  otherCosts: number | null;
  netProfit: number | null;
  orders: number | null;
}

const axisTick = { fill: "var(--subtle)", fontSize: 11 };

function compact(currency: string) {
  return (v: number) => formatMoney(v, currency, { compact: true });
}

function ChartTooltip({
  active,
  payload,
  label,
  currency,
  extra,
}: {
  active?: boolean;
  payload?: { name: string; value: number | null; color: string; dataKey: string; payload: SeriesPoint }[];
  label?: string;
  currency: string;
  extra?: (p: SeriesPoint) => React.ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-4 tabular font-medium">{p.value === null || p.value === undefined ? NA : formatMoney(p.value, currency)}</span>
        </div>
      ))}
      {extra?.(payload[0].payload)}
    </div>
  );
}

/** Shopify net sales vs Meta spend over time (single money axis). */
export function SalesSpendChart({ data, currency }: { data: SeriesPoint[]; currency: string }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Line chart of Shopify net sales and Meta spend over time">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} minTickGap={24} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={compact(currency)} width={64} />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={(p) => (
              <ChartTooltip
                {...(p as object)}
                currency={currency}
                extra={(pt) => (
                  <div className="mt-1 border-t border-border pt-1 text-muted-foreground">
                    Shopify ROAS:{" "}
                    {pt.netSales !== null && pt.metaSpend ? `${(pt.netSales / pt.metaSpend).toFixed(2)}x` : NA} · Orders: {formatNumber(pt.orders)}
                  </div>
                )}
              />
            )}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
          <Line type="monotone" dataKey="netSales" name="Shopify net sales" stroke="var(--series-1)" strokeWidth={2} dot={data.length < 32 ? { r: 3 } : false} activeDot={{ r: 5 }} connectNulls={false} animationDuration={500} />
          <Line type="monotone" dataKey="metaSpend" name="Meta spend" stroke="var(--series-2)" strokeWidth={2} dot={data.length < 32 ? { r: 3 } : false} activeDot={{ r: 5 }} connectNulls={false} animationDuration={500} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Where each unit of revenue went: stacked bars whose positive height equals
 * net sales (costs + profit). A loss is drawn below the zero line.
 */
export function ProfitCompositionChart({ data, currency }: { data: SeriesPoint[]; currency: string }) {
  const rows = data.map((d) => ({
    ...d,
    profitPos: d.netProfit !== null && d.netProfit >= 0 ? d.netProfit : d.netProfit === null ? null : 0,
    loss: d.netProfit !== null && d.netProfit < 0 ? d.netProfit : d.netProfit === null ? null : 0,
  }));
  return (
    <div className="h-72 w-full" role="img" aria-label="Stacked bar chart of how net sales split into costs and net profit">
      <ResponsiveContainer>
        <BarChart data={rows} stackOffset="sign" margin={{ top: 8, right: 16, left: 4, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} minTickGap={24} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={compact(currency)} width={64} />
          <ReferenceLine y={0} stroke="var(--axis)" />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={(p) => {
              const pt = (p.payload?.[0]?.payload ?? null) as SeriesPoint | null;
              if (!p.active || !pt) return null;
              const rowsT: [string, number | null, string][] = [
                ["Net sales", pt.netSales, "transparent"],
                ["Product cost", pt.productCost, "var(--series-3)"],
                ["Meta ad spend", pt.metaSpend, "var(--series-2)"],
                ["Other costs", pt.otherCosts, "var(--series-4)"],
                ["Net profit", pt.netProfit, "var(--series-1)"],
              ];
              return (
                <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-lg">
                  <div className="mb-1 font-medium">{pt.label}</div>
                  {rowsT.map(([n, v, c]) => (
                    <div key={n} className="flex items-center gap-2">
                      <span className="inline-block size-2 rounded-full" style={{ background: c, border: c === "transparent" ? "1px solid var(--axis)" : undefined }} />
                      <span className="text-muted-foreground">{n}</span>
                      <span className="ml-auto pl-4 tabular font-medium">{v === null ? NA : formatMoney(v, currency)}</span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="otherCosts" name="Other costs" stackId="s" fill="var(--series-4)" stroke="var(--card)" strokeWidth={1} />
          <Bar dataKey="productCost" name="Product cost" stackId="s" fill="var(--series-3)" stroke="var(--card)" strokeWidth={1} />
          <Bar dataKey="metaSpend" name="Meta ad spend" stackId="s" fill="var(--series-2)" stroke="var(--card)" strokeWidth={1} />
          <Bar dataKey="profitPos" name="Net profit" stackId="s" fill="var(--series-1)" stroke="var(--card)" strokeWidth={1} radius={[4, 4, 0, 0]} />
          <Bar dataKey="loss" name="Net loss" stackId="s" fill="var(--series-8)" stroke="var(--card)" strokeWidth={1} radius={[0, 0, 4, 4]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NetProfitTrendChart({ data, currency }: { data: SeriesPoint[]; currency: string }) {
  const rows = data.map((d) => ({ ...d, pos: d.netProfit !== null && d.netProfit >= 0 ? d.netProfit : null, neg: d.netProfit !== null && d.netProfit < 0 ? d.netProfit : null }));
  return (
    <div className="h-56 w-full" role="img" aria-label="Bar chart of net profit per period">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} minTickGap={24} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={compact(currency)} width={64} />
          <ReferenceLine y={0} stroke="var(--axis)" />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={(p) => {
              const pt = (p.payload?.[0]?.payload ?? null) as SeriesPoint | null;
              if (!p.active || !pt) return null;
              return (
                <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-lg">
                  <div className="font-medium">{pt.label}</div>
                  <div>Net profit: <span className="tabular font-medium">{pt.netProfit === null ? `${NA} (data incomplete)` : formatMoney(pt.netProfit, currency)}</span></div>
                </div>
              );
            }}
          />
          <Bar dataKey="pos" name="Net profit" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="neg" name="Net loss" fill="var(--series-8)" radius={[0, 0, 4, 4]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HourlySalesChart({ data, currency }: { data: { hour: number; orders: number; salesAfterDiscounts: number }[]; currency: string }) {
  const rows = data.map((d) => ({ ...d, label: `${String(d.hour).padStart(2, "0")}:00` }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Bar chart of sales by hour of day">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} interval={2} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={compact(currency)} width={64} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={(p) => {
              const pt = p.payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!p.active || !pt) return null;
              return (
                <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-lg">
                  <div className="font-medium">{pt.label}</div>
                  <div>Sales after discounts: {formatMoney(pt.salesAfterDiscounts, currency)}</div>
                  <div>Orders: {pt.orders}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="salesAfterDiscounts" name="Sales (order time, before returns)" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
