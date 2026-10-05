"use client";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { timeAgo } from "@/lib/format";
import { Markdown } from "./markdown";

export interface AiRequest {
  kind: "daily_summary" | "question" | "campaign";
  question?: string;
  campaignId?: string;
  from: string;
  to: string;
  compareFrom?: string | null;
  compareTo?: string | null;
  filters?: Record<string, string | null | undefined>;
}

async function callAi(req: AiRequest): Promise<{ output: string; createdAt: string }> {
  const res = await fetch("/api/ai/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  const body = (await res.json().catch(() => ({}))) as { output?: string; createdAt?: string; error?: string };
  if (!res.ok || !body.output) throw new Error(body.error ?? `AI request failed (${res.status})`);
  return { output: body.output, createdAt: body.createdAt ?? new Date().toISOString() };
}

export function AiAnswer({ request, title, onClose }: { request: AiRequest; title: string; onClose?: () => void }) {
  const [state, setState] = useState<{ loading: boolean; output?: string; error?: string }>({ loading: true });
  useEffect(() => {
    let live = true;
    callAi(request).then(
      (r) => live && setState({ loading: false, output: r.output }),
      (e: Error) => live && setState({ loading: false, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [request]);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />{title}</CardTitle>
        {onClose && <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close"><X /></Button>}
      </CardHeader>
      <CardContent>
        {state.loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Analysing your data…</p>}
        {state.error && <p className="text-sm text-critical" role="alert">{state.error}</p>}
        {state.output && <Markdown text={state.output} />}
      </CardContent>
    </Card>
  );
}

/** AI Business Summary at the top of the dashboard (cached; regenerate on demand). */
export function AiSummary({
  initial,
  request,
  configured,
}: {
  initial: { output: string; createdAt: string } | null;
  request: AiRequest;
  configured: boolean;
}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function regenerate() {
    setLoading(true);
    setError(null);
    try {
      setData(await callAi(request));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />AI Business Summary</CardTitle>
          <p className="text-[11px] text-subtle">
            {data ? `Generated ${timeAgo(data.createdAt)} from your database metrics for ${request.from} → ${request.to}` : "Generated only from your synced data. Never uses data that isn't in the database."}
          </p>
        </div>
        {configured && (
          <Button size="sm" variant="outline" onClick={regenerate} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {data ? "Regenerate" : "Generate"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!configured && <p className="text-sm text-muted-foreground">AI analysis is not configured. Set <code>AI_API_KEY</code> on the server to enable it.</p>}
        {error && <p className="text-sm text-critical" role="alert">{error}</p>}
        {data ? <Markdown text={data.output} /> : configured && !loading && <p className="text-sm text-muted-foreground">No summary for this period yet.</p>}
        {loading && !data && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Analysing…</p>}
      </CardContent>
    </Card>
  );
}

export function AiChat({ presets, base, history }: { presets: string[]; base: Omit<AiRequest, "kind" | "question">; history: { id: string; question: string | null; output: string; createdAt: string }[] }) {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<AiRequest[]>([]);
  const ask = (question: string) => {
    if (!question.trim()) return;
    setAsked((a) => [{ ...base, kind: "question", question: question.trim() }, ...a]);
    setQ("");
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button key={p} size="sm" variant="outline" onClick={() => ask(p)}>{p}</Button>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your sales, spend, profit or campaigns…" maxLength={500} aria-label="Question" />
        <Button type="submit"><Sparkles />Ask</Button>
      </form>
      {asked.map((r, i) => (
        <AiAnswer key={`${asked.length - i}`} request={r} title={r.question!} />
      ))}
      {history.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Previous analyses</h3>
          {history.map((h) => (
            <details key={h.id} className="rounded-lg border border-border bg-card p-3">
              <summary className="cursor-pointer text-sm font-medium">{h.question ?? "Analysis"} <span className="text-xs text-subtle">· {timeAgo(h.createdAt)}</span></summary>
              <div className="mt-2"><Markdown text={h.output} /></div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
