import { NextResponse } from "next/server";
import { apiStore } from "@/lib/session";
import { runStoreSync } from "@/lib/sync/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Manual "Sync now". */
export async function POST(req: Request) {
  const ctx = await apiStore(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.store.isDemo) return NextResponse.json({ errors: ["Demo store — no live connections to sync."] });
  const summary = await runStoreSync(ctx.store.id, "manual", "manual", 240_000);
  return NextResponse.json(summary);
}
