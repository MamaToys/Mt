/**
 * Calendar-date utilities. All reporting is bucketed by *store-local* calendar
 * dates represented as "YYYY-MM-DD" strings. Calendar arithmetic is done on
 * UTC-midnight Date objects, which have no DST, so adding days is exact.
 */

export type DateStr = string; // YYYY-MM-DD
export type Granularity = "hour" | "day" | "week" | "month";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateStr(s: unknown): s is DateStr {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function parts(instant: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(instant)) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Calendar date of an instant in the given IANA timezone. */
export function localDateOf(instant: Date, timeZone: string): DateStr {
  const p = parts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Hour of day (0–23) of an instant in the given timezone. */
export function localHourOf(instant: Date, timeZone: string): number {
  return parts(instant, timeZone).hour;
}

export function todayIn(timeZone: string, now: Date = new Date()): DateStr {
  return localDateOf(now, timeZone);
}

/** Offset (ms) of `timeZone` from UTC at `instant`. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const p = parts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant at which local midnight of `date` occurs in `timeZone`. */
export function startOfLocalDay(date: DateStr, timeZone: string): Date {
  const guess = new Date(`${date}T00:00:00Z`).getTime();
  // Two passes handle DST transitions.
  let t = guess - tzOffsetMs(new Date(guess), timeZone);
  t = guess - tzOffsetMs(new Date(t), timeZone);
  return new Date(t);
}

/** [start, end) UTC instants for a store-local date range (inclusive dates). */
export function localRangeBounds(from: DateStr, to: DateStr, timeZone: string): { start: Date; end: Date } {
  return { start: startOfLocalDay(from, timeZone), end: startOfLocalDay(addDays(to, 1), timeZone) };
}

export function toUtcDate(d: DateStr): Date {
  return new Date(`${d}T00:00:00Z`);
}

/** Converts a Postgres DATE (returned by Prisma as UTC midnight) to DateStr. */
export function fromDbDate(d: Date): DateStr {
  return d.toISOString().slice(0, 10);
}

export const toDbDate = toUtcDate;

export function addDays(d: DateStr, n: number): DateStr {
  const t = toUtcDate(d);
  t.setUTCDate(t.getUTCDate() + n);
  return fromDbDate(t);
}

export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / 86_400_000);
}

export function daysInRange(from: DateStr, to: DateStr): number {
  return diffDays(from, to) + 1;
}

export function eachDay(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function minDate(a: DateStr, b: DateStr): DateStr {
  return a < b ? a : b;
}
export function maxDate(a: DateStr, b: DateStr): DateStr {
  return a > b ? a : b;
}

export function dayOfWeek(d: DateStr): number {
  return toUtcDate(d).getUTCDay();
}

export function startOfWeek(d: DateStr, weekStartsOn = 1): DateStr {
  const delta = (dayOfWeek(d) - weekStartsOn + 7) % 7;
  return addDays(d, -delta);
}

export function startOfMonth(d: DateStr): DateStr {
  return `${d.slice(0, 7)}-01`;
}

export function daysInMonth(d: DateStr): number {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function endOfMonth(d: DateStr): DateStr {
  return `${d.slice(0, 7)}-${String(daysInMonth(d)).padStart(2, "0")}`;
}

/** Shift by whole months, clamping the day (Mar 31 − 1 month = Feb 28/29). */
export function addMonths(d: DateStr, n: number): DateStr {
  const [y, m, day] = d.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const ym = fromDbDate(first).slice(0, 7);
  const dim = daysInMonth(`${ym}-01`);
  return `${ym}-${String(Math.min(day, dim)).padStart(2, "0")}`;
}

export function startOfQuarter(d: DateStr): DateStr {
  const [y, m] = d.split("-").map(Number);
  const qm = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(qm).padStart(2, "0")}-01`;
}

export function startOfYear(d: DateStr): DateStr {
  return `${d.slice(0, 4)}-01-01`;
}

/** Key of the bucket a date belongs to for the given granularity. */
export function bucketKey(d: DateStr, g: Exclude<Granularity, "hour">, weekStartsOn = 1): DateStr {
  if (g === "day") return d;
  if (g === "week") return startOfWeek(d, weekStartsOn);
  return startOfMonth(d);
}

// ───────────────────────────── Ranges & comparisons ─────────────────────────────

export const RANGE_PRESETS = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_quarter",
  "this_year",
  "last_year",
  "custom",
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const COMPARE_MODES = ["previous_period", "previous_week", "previous_month", "previous_year", "none"] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

export interface DateRange {
  from: DateStr;
  to: DateStr;
}

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  this_year: "This year",
  last_year: "Last year",
  custom: "Custom range",
};

export const COMPARE_LABELS: Record<CompareMode, string> = {
  previous_period: "Previous period",
  previous_week: "Previous week",
  previous_month: "Previous month",
  previous_year: "Previous year",
  none: "No comparison",
};

/**
 * Resolves a preset to an inclusive date range in the store's timezone.
 * "This …" ranges end today (to-date) — future days are never included.
 */
export function resolveRange(
  preset: RangePreset,
  today: DateStr,
  opts: { weekStartsOn?: number; from?: string | null; to?: string | null } = {},
): DateRange {
  const ws = opts.weekStartsOn ?? 1;
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "this_week":
      return { from: startOfWeek(today, ws), to: today };
    case "last_week": {
      const s = addDays(startOfWeek(today, ws), -7);
      return { from: s, to: addDays(s, 6) };
    }
    case "this_month":
      return { from: startOfMonth(today), to: today };
    case "last_month": {
      const s = addMonths(startOfMonth(today), -1);
      return { from: s, to: endOfMonth(s) };
    }
    case "this_quarter":
      return { from: startOfQuarter(today), to: today };
    case "this_year":
      return { from: startOfYear(today), to: today };
    case "last_year": {
      const y = Number(today.slice(0, 4)) - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case "custom": {
      let from = isDateStr(opts.from) ? opts.from : addDays(today, -6);
      let to = isDateStr(opts.to) ? opts.to : today;
      if (from > to) [from, to] = [to, from];
      to = minDate(to, today); // never report on future days
      if (from > to) from = to;
      return { from, to };
    }
  }
}

/**
 * Comparison range.
 * - previous_period: same number of days immediately before.
 * - previous_week:   shifted back 7 days.
 * - previous_month:  shifted back one calendar month (day clamped).
 * - previous_year:   shifted back one year (Feb 29 → Feb 28).
 */
export function resolveComparison(range: DateRange, mode: CompareMode): DateRange | null {
  switch (mode) {
    case "none":
      return null;
    case "previous_period": {
      const len = daysInRange(range.from, range.to);
      return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
    }
    case "previous_week":
      return { from: addDays(range.from, -7), to: addDays(range.to, -7) };
    case "previous_month":
    case "previous_year": {
      const n = mode === "previous_month" ? -1 : -12;
      // Whole calendar months compare with whole calendar months (Sep 1–30 → Aug 1–31).
      if (range.from === startOfMonth(range.from) && range.to === endOfMonth(range.to)) {
        return { from: addMonths(range.from, n), to: endOfMonth(addMonths(range.to.slice(0, 8) + "01", n)) };
      }
      return { from: addMonths(range.from, n), to: addMonths(range.to, n) };
    }
  }
}

export function formatRange(r: DateRange): string {
  const f = (d: DateStr) =>
    toUtcDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return r.from === r.to ? f(r.from) : `${f(r.from)} – ${f(r.to)}`;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
