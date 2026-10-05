import "server-only";
import { env } from "../env";
import { metaGet } from "./client";

export const META_SCOPES = "ads_read,business_management";

export function metaOAuthConfigured(): boolean {
  return !!(env.meta.appId && env.meta.appSecret);
}

export function metaRedirectUri() {
  return `${env.appUrl}/api/integrations/meta/callback`;
}

export function metaAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: env.meta.appId!,
    redirect_uri: metaRedirectUri(),
    state,
    scope: META_SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${env.meta.apiVersion}/dialog/oauth?${p.toString()}`;
}

async function tokenRequest(params: Record<string, string>): Promise<{ access_token: string; expires_in?: number }> {
  const url = new URL(`https://graph.facebook.com/${env.meta.apiVersion}/oauth/access_token`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Token endpoints require credentials as query params; this call is server-side only.
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: { message: string } };
  if (!res.ok || !body.access_token) throw new Error(`Meta token exchange failed: ${body.error?.message ?? res.status}`);
  return { access_token: body.access_token, expires_in: body.expires_in };
}

/** Exchanges the OAuth code for a long-lived (~60 day) user token. */
export async function exchangeMetaCode(code: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
  const short = await tokenRequest({
    client_id: env.meta.appId!,
    client_secret: env.meta.appSecret!,
    redirect_uri: metaRedirectUri(),
    code,
  });
  const long = await tokenRequest({
    grant_type: "fb_exchange_token",
    client_id: env.meta.appId!,
    client_secret: env.meta.appSecret!,
    fb_exchange_token: short.access_token,
  });
  return { accessToken: long.access_token, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null };
}

export async function fetchMetaUser(token: string): Promise<{ id: string; name: string }> {
  return metaGet<{ id: string; name: string }>("me", token, { fields: "id,name" });
}
