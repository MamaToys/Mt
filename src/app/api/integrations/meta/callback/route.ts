import { NextResponse } from "next/server";
import { apiStore, canEdit } from "@/lib/session";
import { consumeState } from "@/lib/oauth-state";
import { exchangeMetaCode } from "@/lib/meta/oauth";
import { saveMetaConnection } from "@/lib/integrations";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${env.appUrl}/integrations?${q}`);
  const ctx = await apiStore(req);
  if (!ctx || !canEdit(ctx.role)) return NextResponse.redirect(`${env.appUrl}/login`);
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent(url.searchParams.get("error_description") ?? "meta_denied")}`);
  if (!(await consumeState(url.searchParams.get("state")))) return back("error=oauth_state_mismatch");
  const code = url.searchParams.get("code");
  if (!code) return back("error=meta_missing_code");
  try {
    const { accessToken, expiresAt } = await exchangeMetaCode(code);
    await saveMetaConnection(ctx.store.id, accessToken, expiresAt);
  } catch (e) {
    return back(`error=${encodeURIComponent(errorMessage(e))}`);
  }
  return back("connected=meta");
}
