"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RefreshButton({ label = "Sync now" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { errors?: string[]; error?: string };
      if (!res.ok) setMsg(body.error ?? "Sync failed");
      else if (body.errors?.length) setMsg(body.errors.join(" · "));
    } catch {
      setMsg("Network error — sync not started");
    } finally {
      setBusy(false);
      start(() => router.refresh());
    }
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={run} disabled={busy} title="Fetch the latest data from Shopify and Meta now">
        <RefreshCw className={busy ? "animate-spin" : ""} />
        {busy ? "Syncing…" : label}
      </Button>
      {msg && <span role="status" className="max-w-xs truncate text-xs text-critical" title={msg}>{msg}</span>}
    </div>
  );
}
