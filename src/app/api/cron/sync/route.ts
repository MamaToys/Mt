import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { runAllStores } from "@/lib/sync/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Scheduled sync (Vercel Cron, see vercel.json):
 *  - mode=recent every 15 min: Shopify incremental + Meta today/last 2 days
 *  - mode=daily once a day: products, Meta last 28 days + history backfill, 35-day re-rollup
 */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mode = new URL(req.url).searchParams.get("mode") === "daily" ? "daily" : "recent";
  const results = await runAllStores(mode, `cron_${mode}`);
  return NextResponse.json({ mode, stores: results.length, results });
}
