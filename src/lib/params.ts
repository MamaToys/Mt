import {
  COMPARE_LABELS,
  COMPARE_MODES,
  CompareMode,
  DateRange,
  Granularity,
  PRESET_LABELS,
  RANGE_PRESETS,
  RangePreset,
  daysInRange,
  formatRange,
  resolveComparison,
  resolveRange,
  todayIn,
} from "./metrics/dates";
import type { Filters } from "./reports/queries";

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export interface ViewParams {
  preset: RangePreset;
  range: DateRange;
  compareMode: CompareMode;
  compare: DateRange | null;
  granularity: Exclude<Granularity, "hour"> | "hour";
  filters: Filters;
  today: string;
  label: string;
  compareLabel: string | null;
}

/** Parses the shared dashboard URL state (?range=&from=&to=&compare=&g=&account=…). */
export function parseView(sp: SearchParams, store: { timezone: string; weekStartsOn: number }, defaults: Partial<{ preset: RangePreset }> = {}): ViewParams {
  const today = todayIn(store.timezone);
  const rawPreset = one(sp.range);
  const preset: RangePreset = RANGE_PRESETS.includes(rawPreset as RangePreset) ? (rawPreset as RangePreset) : (defaults.preset ?? "last7");
  const range = resolveRange(preset, today, { weekStartsOn: store.weekStartsOn, from: one(sp.from), to: one(sp.to) });
  const rawCompare = one(sp.compare);
  const compareMode: CompareMode = COMPARE_MODES.includes(rawCompare as CompareMode) ? (rawCompare as CompareMode) : "previous_period";
  const compare = resolveComparison(range, compareMode);
  const len = daysInRange(range.from, range.to);
  const rawG = one(sp.g);
  const granularity =
    rawG === "hour" || rawG === "day" || rawG === "week" || rawG === "month"
      ? rawG
      : len > 120 ? "month" : len > 45 ? "week" : len === 1 ? "hour" : "day";
  return {
    preset,
    range,
    compareMode,
    compare,
    granularity,
    today,
    filters: {
      account: one(sp.account),
      campaign: one(sp.campaign),
      adset: one(sp.adset),
      ad: one(sp.ad),
      product: one(sp.product),
    },
    label: preset === "custom" ? formatRange(range) : `${PRESET_LABELS[preset]} · ${formatRange(range)}`,
    compareLabel: compare ? `${COMPARE_LABELS[compareMode]} · ${formatRange(compare)}` : null,
  };
}

export function hasFilters(f: Filters) {
  return !!(f.account || f.campaign || f.adset || f.ad || f.product);
}
