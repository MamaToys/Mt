import { NextResponse } from "next/server";
import { apiStore, canEdit } from "@/lib/session";
import { issueState } from "@/lib/oauth-state";
import { normalizeShopDomain } from "@/lib/shopify/client";
import { shopifyInstallUrl, shopifyOAuthConfigured } from "@/lib/shopify/oauth";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  const ctx = await apiStore(req);
  if (!ctx || !canEdit(ctx.role)) return NextResponse.redirect(`${env.appUrl}/login`);
  if (!shopifyOAuthConfigured()) return NextResponse.redirect(`${env.appUrl}/integrations?error=shopify_oauth_not_configured`);
  const shop = normalizeShopDomain(new URL(req.url).searchParams.get("shop") ?? "");
  if (!shop) return NextResponse.redirect(`${env.appUrl}/integrations?error=invalid_shop_domain`);
  return NextResponse.redirect(shopifyInstallUrl(shop, await issueState("shopify")));
}
