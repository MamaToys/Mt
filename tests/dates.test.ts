import { describe, expect, it } from "vitest";
import * as D from "@/lib/metrics/dates";

describe("timezone handling", () => {
  it("buckets an order by the store's local date, not UTC", () => {
    // 2026-10-05 03:30 UTC is still Oct 4 in New York (UTC-4)...
    const instant = new Date("2026-10-05T03:30:00Z");
    expect(D.localDateOf(instant, "America/New_York")).toBe("2026-10-04");
    // ...but already Oct 5 in Muscat (UTC+4) and Oct 5 in UTC.
    expect(D.localDateOf(instant, "Asia/Muscat")).toBe("2026-10-05");
    expect(D.localDateOf(instant, "UTC")).toBe("2026-10-05");
    expect(D.localHourOf(instant, "America/New_York")).toBe(23);
  });
  it("computes local midnight across DST", () => {
    // US DST ends 2026-11-01. Midnight Nov 1 is still EDT (UTC-4).
    expect(D.startOfLocalDay("2026-11-01", "America/New_York").toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(D.startOfLocalDay("2026-11-02", "America/New_York").toISOString()).toBe("2026-11-02T05:00:00.000Z");
    const b = D.localRangeBounds("2026-10-05", "2026-10-05", "Asia/Muscat");
    expect(b.start.toISOString()).toBe("2026-10-04T20:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-10-05T20:00:00.000Z");
  });
  it("today depends on store timezone", () => {
    const now = new Date("2026-10-05T22:00:00Z");
    expect(D.todayIn("UTC", now)).toBe("2026-10-05");
    expect(D.todayIn("Asia/Muscat", now)).toBe("2026-10-06");
  });
});

describe("calendar arithmetic", () => {
  it("adds days and months with clamping", () => {
    expect(D.addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(D.addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(D.addMonths("2024-02-29", -12)).toBe("2023-02-28");
    expect(D.daysInMonth("2028-02-10")).toBe(29);
  });
  it("week start respects setting", () => {
    // 2026-10-05 is a Monday
    expect(D.startOfWeek("2026-10-07", 1)).toBe("2026-10-05");
    expect(D.startOfWeek("2026-10-07", 0)).toBe("2026-10-04");
  });
  it("validates date strings", () => {
    expect(D.isDateStr("2026-02-30")).toBe(false);
    expect(D.isDateStr("2026-02-28")).toBe(true);
  });
});

describe("range presets", () => {
  const today = "2026-10-05"; // Monday
  it.each([
    ["today", "2026-10-05", "2026-10-05"],
    ["yesterday", "2026-10-04", "2026-10-04"],
    ["last7", "2026-09-29", "2026-10-05"],
    ["this_week", "2026-10-05", "2026-10-05"],
    ["last_week", "2026-09-28", "2026-10-04"],
    ["this_month", "2026-10-01", "2026-10-05"],
    ["last_month", "2026-09-01", "2026-09-30"],
    ["this_quarter", "2026-10-01", "2026-10-05"],
    ["this_year", "2026-01-01", "2026-10-05"],
    ["last_year", "2025-01-01", "2025-12-31"],
  ] as const)("%s", (preset, from, to) => {
    expect(D.resolveRange(preset, today)).toEqual({ from, to });
  });
  it("custom range never includes future days", () => {
    expect(D.resolveRange("custom", today, { from: "2026-10-01", to: "2026-10-31" })).toEqual({ from: "2026-10-01", to: "2026-10-05" });
  });
});

describe("comparisons", () => {
  it("Oct 1–5 vs Sep 26–30 (previous period)", () => {
    expect(D.resolveComparison({ from: "2026-10-01", to: "2026-10-05" }, "previous_period")).toEqual({ from: "2026-09-26", to: "2026-09-30" });
  });
  it("previous week shifts by 7 days", () => {
    expect(D.resolveComparison({ from: "2026-10-05", to: "2026-10-11" }, "previous_week")).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  });
  it("previous month", () => {
    expect(D.resolveComparison({ from: "2026-10-01", to: "2026-10-31" }, "previous_month")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
  it("October 2026 vs October 2025", () => {
    expect(D.resolveComparison({ from: "2026-10-01", to: "2026-10-31" }, "previous_year")).toEqual({ from: "2025-10-01", to: "2025-10-31" });
  });
  it("none", () => {
    expect(D.resolveComparison({ from: "2026-10-01", to: "2026-10-31" }, "none")).toBeNull();
  });
});
