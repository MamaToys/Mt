import "server-only";
import { env } from "../env";
import { hmacSha256, safeEqual } from "../crypto";

export function shopifyOAuthConfigured(): boolean {
  return !!(env.shopify.clientId && env.shopify.clientSecret);
}

export function shopifyInstallUrl(shop: string, state: string): string {
  const p = new URLSearchParams({
    client_id: env.shopify.clientId!,
    scope: env.shopify.scopes,
    redirect_uri: `${env.appUrl}/api/integrations/shopify/callback`,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${p.toString()}`;
}

/** Verifies the `hmac` query parameter Shopify adds to OAuth redirects. */
export function verifyShopifyQueryHmac(params: URLSearchParams, secret = env.shopify.clientSecret): boolean {
  const hmac = params.get("hmac");
  if (!hmac || !secret) return false;
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return safeEqual(hmacSha256(secret, message, "hex"), hmac);
}

/** Verifies X-Shopify-Hmac-Sha256 on a webhook (HMAC of the raw body). */
export function verifyShopifyWebhookHmac(rawBody: string, header: string | null, secret = env.shopify.clientSecret): boolean {
  if (!header || !secret) return false;
  return safeEqual(hmacSha256(secret, rawBody, "base64"), header);
}

export async function exchangeShopifyCode(shop: string, code: string): Promise<{ accessToken: string; scope: string }> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: env.shopify.clientId, client_secret: env.shopify.clientSecret, code }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Shopify token exchange failed (${res.status}).`);
  const body = (await res.json()) as { access_token: string; scope: string };
  return { accessToken: body.access_token, scope: body.scope };
}
