import { NextResponse } from "next/server";
import { apiStore, canEdit } from "@/lib/session";
import { issueState } from "@/lib/oauth-state";
import { metaAuthUrl, metaOAuthConfigured } from "@/lib/meta/oauth";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  const ctx = await apiStore(req);
  if (!ctx || !canEdit(ctx.role)) return NextResponse.redirect(`${env.appUrl}/login`);
  if (!metaOAuthConfigured()) return NextResponse.redirect(`${env.appUrl}/integrations?error=meta_oauth_not_configured`);
  return NextResponse.redirect(metaAuthUrl(await issueState("meta")));
}
