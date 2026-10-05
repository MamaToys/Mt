/**
 * Explicit currency conversion. Amounts are only converted with a known rate;
 * when no rate exists the result is null and the caller must flag it —
 * currencies are never silently mixed.
 */
import { DateStr, addDays } from "./dates";

export interface FxRate {
  base: string;
  quote: string;
  date: DateStr;
  rate: number; // 1 base = rate quote
}

/** Max days to look back for the most recent rate on/before a date. */
export const FX_LOOKBACK_DAYS = 7;

export class FxTable {
  private byPair = new Map<string, Map<DateStr, number>>();

  constructor(rates: FxRate[] = []) {
    for (const r of rates) this.add(r);
  }

  add(r: FxRate) {
    const k = `${r.base.toUpperCase()}>${r.quote.toUpperCase()}`;
    let m = this.byPair.get(k);
    if (!m) this.byPair.set(k, (m = new Map()));
    m.set(r.date, r.rate);
  }

  private direct(from: string, to: string, date: DateStr): number | null {
    const m = this.byPair.get(`${from}>${to}`);
    if (!m) return null;
    for (let i = 0; i <= FX_LOOKBACK_DAYS; i++) {
      const v = m.get(addDays(date, -i));
      if (v !== undefined) return v;
    }
    return null;
  }

  /** Rate to multiply an amount in `from` by to get `to`, or null if unknown. */
  rate(from: string, to: string, date: DateStr): number | null {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return 1;
    const d = this.direct(f, t, date);
    if (d !== null) return d;
    const inv = this.direct(t, f, date);
    if (inv !== null && inv !== 0) return 1 / inv;
    return null;
  }

  convert(amount: number | null, from: string, to: string, date: DateStr): number | null {
    if (amount === null) return null;
    const r = this.rate(from, to, date);
    return r === null ? null : amount * r;
  }
}
