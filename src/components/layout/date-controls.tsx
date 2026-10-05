"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect, Input } from "@/components/ui/input";
import { parseView } from "@/lib/params";
import { COMPARE_LABELS, COMPARE_MODES, PRESET_LABELS, RANGE_PRESETS } from "@/lib/metrics/dates";

export function useUpdateParams() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`);
  };
}

export function DateControls({ preset, from, to, compare }: { preset: string; from: string; to: string; compare: string }) {
  const update = useUpdateParams();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label="Date range"
        value={preset}
        onChange={(e) => update(e.target.value === "custom" ? { range: "custom", from, to } : { range: e.target.value, from: null, to: null })}
      >
        {RANGE_PRESETS.map((p) => (
          <option key={p} value={p}>{PRESET_LABELS[p]}</option>
        ))}
      </NativeSelect>
      {preset === "custom" && (
        <>
          <Input aria-label="From" type="date" className="w-36" defaultValue={from} onChange={(e) => e.target.value && update({ range: "custom", from: e.target.value })} />
          <span className="text-xs text-subtle">to</span>
          <Input aria-label="To" type="date" className="w-36" defaultValue={to} onChange={(e) => e.target.value && update({ range: "custom", to: e.target.value })} />
        </>
      )}
      <NativeSelect aria-label="Compare to" value={compare} onChange={(e) => update({ compare: e.target.value })}>
        {COMPARE_MODES.map((m) => (
          <option key={m} value={m}>vs {COMPARE_LABELS[m]}</option>
        ))}
      </NativeSelect>
    </div>
  );
}

/** Reads the shared URL state and renders the range/compare controls plus the resolved dates. */
export function UrlDateControls({ timezone, weekStartsOn }: { timezone: string; weekStartsOn: number }) {
  const sp = useSearchParams();
  const view = parseView(Object.fromEntries(sp.entries()), { timezone, weekStartsOn });
  return (
    <div className="flex flex-col gap-0.5">
      <DateControls preset={view.preset} from={view.range.from} to={view.range.to} compare={view.compareMode} />
      <p className="text-[11px] text-subtle">
        {view.label}
        {view.compareLabel ? ` · compared with ${view.compareLabel}` : ""} · {timezone}
      </p>
    </div>
  );
}
