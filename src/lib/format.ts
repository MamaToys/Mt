/** Display formatting shared by server and client. Null/undefined → "N/A". */

export const NA = "N/A";

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export function formatMoney(v: number | null | undefined, currency: string, opts: { compact?: boolean; decimals?: number } = {}): string {
  if (!isNum(v)) return NA;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.compact ? 1 : (opts.decimals ?? 2),
      minimumFractionDigits: opts.compact ? 0 : Math.min(opts.decimals ?? 2, 2),
    }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}

export function formatNumber(v: number | null | undefined, decimals = 0): string {
  if (!isNum(v)) return NA;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(v);
}

export function formatRoas(v: number | null | undefined): string {
  return isNum(v) ? `${v.toFixed(2)}x` : NA;
}

export function formatPct(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? `${v.toFixed(decimals)}%` : NA;
}

export function formatChange(v: number | null | undefined): string {
  if (!isNum(v)) return NA;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export function timeAgo(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return "never";
  const t = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((now.getTime() - t.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function formatDateTime(d: Date | string | null | undefined, timeZone: string): string {
  if (!d) return "never";
  const t = typeof d === "string" ? new Date(d) : d;
  return t.toLocaleString("en-US", { timeZone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}
