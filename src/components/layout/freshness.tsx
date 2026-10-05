import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { Freshness } from "@/lib/reports/queries";
import { formatDateTime, timeAgo } from "@/lib/format";

function Status({ name, s, timezone }: { name: string; timezone: string; s: Freshness["shopify"] | Freshness["meta"] }) {
  if (!s) {
    return (
      <span className="flex items-center gap-1 text-xs text-subtle">
        <CircleDashed className="size-3.5" /> {name}: not connected
      </span>
    );
  }
  const failing = s.status === "ERROR" || s.status === "EXPIRED" || (!!s.lastError && s.lastSyncAt && (!s.lastSuccessfulSyncAt || s.lastSyncAt > s.lastSuccessfulSyncAt));
  if (failing) {
    return (
      <span className="flex items-center gap-1 text-xs text-critical" title={s.lastError ?? undefined}>
        <XCircle className="size-3.5" /> {name} data unavailable{s.status === "EXPIRED" ? " (reconnect required)" : ""} — last successful sync:{" "}
        {formatDateTime(s.lastSuccessfulSyncAt, timezone)}
      </span>
    );
  }
  const importing = "initialImportComplete" in s && !s.initialImportComplete;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" title={s.lastSuccessfulSyncAt ? formatDateTime(s.lastSuccessfulSyncAt, timezone) : undefined}>
      {importing ? <AlertTriangle className="size-3.5 text-warning" /> : <CheckCircle2 className="size-3.5 text-good" />}
      Last {name} sync: {timeAgo(s.lastSuccessfulSyncAt)}
      {importing ? " (initial import in progress)" : ""}
    </span>
  );
}

export function FreshnessBar({ f, timezone }: { f: Freshness; timezone: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Status name="Shopify" s={f.shopify} timezone={timezone} />
      <Status name="Meta" s={f.meta} timezone={timezone} />
    </div>
  );
}
