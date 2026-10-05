import { after, NextResponse } from "next/server";
import { apiStore, canEdit } from "@/lib/session";
import { consumeState } from "@/lib/oauth-state";
import { normalizeShopDomain } from "@/lib/shopify/client";
import { exchangeShopifyCode, verifyShopifyQueryHmac } from "@/lib/shopify/oauth";
import { saveShopifyConnection } from "@/lib/integrations";
import { runStoreSync } from "@/lib/sync/orchestrator";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${env.appUrl}/integrations?${q}`);
  const ctx = await apiStore(req);
  if (!ctx || !canEdit(ctx.role)) return NextResponse.redirect(`${env.appUrl}/login`);
  if (!verifyShopifyQueryHmac(url.searchParams)) return back("error=shopify_hmac_invalid");
  if (!(await consumeState(url.searchParams.get("state")))) return back("error=oauth_state_mismatch");
  const shop = normalizeShopDomain(url.searchParams.get("shop") ?? "");
  const code = url.searchParams.get("code");
  if (!shop || !code) return back("error=shopify_missing_params");
  try {
    const { accessToken, scope } = await exchangeShopifyCode(shop, code);
    await saveShopifyConnection(ctx.store.id, shop, accessToken, scope);
  } catch (e) {
    return back(`error=${encodeURIComponent(errorMessage(e))}`);
  }
  after(() => runStoreSync(ctx.store.id, "manual", "initial_connect").then(() => undefined));
  return back("connected=shopify");
}
