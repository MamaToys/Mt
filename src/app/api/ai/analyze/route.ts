import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStore } from "@/lib/session";
import { AiUnavailableError, analyze } from "@/lib/ai/service";
import { isDateStr } from "@/lib/metrics/dates";
import { errorMessage } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

const date = z.string().refine(isDateStr, "Invalid date");
const Body = z.object({
  kind: z.enum(["daily_summary", "question", "campaign"]),
  question: z.string().min(1).max(500).optional(),
  campaignId: z.string().regex(/^\d+$/).optional(),
  from: date,
  to: date,
  compareFrom: date.nullable().optional(),
  compareTo: date.nullable().optional(),
  filters: z.record(z.string(), z.string().nullable().optional()).optional(),
});

export async function POST(req: Request) {
  const ctx = await apiStore(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const b = parsed.data;
  if (b.kind === "question" && !b.question) return NextResponse.json({ error: "Question required" }, { status: 400 });
  if (b.kind === "campaign" && !b.campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  try {
    const r = await analyze({
      storeId: ctx.store.id,
      userId: ctx.user.id,
      kind: b.kind,
      question: b.question,
      campaignId: b.campaignId,
      range: { from: b.from, to: b.to },
      compare: b.compareFrom && b.compareTo ? { from: b.compareFrom, to: b.compareTo } : null,
      filters: b.filters ?? {},
    });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof AiUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("AI analysis failed", e);
    return NextResponse.json({ error: `AI analysis failed: ${errorMessage(e)}` }, { status: 502 });
  }
}
