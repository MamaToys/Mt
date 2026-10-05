import "server-only";
import { db } from "./db";
import { encryptSecret } from "./crypto";
import { isValidTimeZone } from "./metrics/dates";
import { fetchShopInfo, registerShopifyWebhooks } from "./shopify/sync";
import { fetchMetaUser } from "./meta/oauth";
import { refreshAdAccounts } from "./meta/sync";
import { env } from "./env";

/**
 * Saves a Shopify connection (OAuth or custom-app token). Adopts the shop's
 * currency and timezone as the store's reporting currency/timezone.
 */
export async function saveShopifyConnection(storeId: string, shopDomain: string, accessToken: string, scopes: string | null) {
  const shop = await fetchShopInfo({ shopDomain, accessToken });
  const existingOther = await db.shopifyConnection.findUnique({ where: { shopDomain } });
  if (existingOther && existingOther.storeId !== storeId) throw new Error("This Shopify store is already connected to another account.");
  const current = await db.shopifyConnection.findUnique({ where: { storeId } });
  if (current && current.shopDomain !== shopDomain) {
    // A different shop: its orders, products and sync cursor must not mix with the previous shop's.
    await db.$transaction([
      db.shopifyOrder.deleteMany({ where: { storeId } }),
      db.shopifyProduct.deleteMany({ where: { storeId } }),
      db.productCost.deleteMany({ where: { storeId, source: "SHOPIFY" } }),
      db.shopifyConnection.delete({ where: { storeId } }),
    ]);
  }
  const data = {
    shopDomain,
    accessTokenEnc: encryptSecret(accessToken),
    scopes,
    status: "ACTIVE" as const,
    shopName: shop.name,
    shopCurrency: shop.currencyCode,
    shopTimezone: shop.ianaTimezone,
    lastError: null,
  };
  await db.shopifyConnection.upsert({ where: { storeId }, create: { storeId, ...data }, update: data });
  await db.store.update({
    where: { id: storeId },
    data: {
      name: shop.name,
      currency: shop.currencyCode,
      ...(isValidTimeZone(shop.ianaTimezone) ? { timezone: shop.ianaTimezone } : {}),
    },
  });
  let webhookErrors: string[] = [];
  if (env.shopify.clientSecret && env.appUrl.startsWith("https://")) {
    webhookErrors = await registerShopifyWebhooks(storeId).catch((e: Error) => [e.message]);
  } else {
    webhookErrors = ["Webhooks need a public HTTPS APP_URL and SHOPIFY_CLIENT_SECRET; scheduled sync is used instead."];
  }
  return { shop, webhookErrors };
}

export async function saveMetaConnection(storeId: string, accessToken: string, expiresAt: Date | null) {
  const me = await fetchMetaUser(accessToken);
  const data = {
    metaUserId: me.id,
    metaUserName: me.name,
    accessTokenEnc: encryptSecret(accessToken),
    tokenExpiresAt: expiresAt,
    status: "ACTIVE" as const,
    lastError: null,
  };
  await db.metaConnection.upsert({ where: { storeId }, create: { storeId, ...data }, update: data });
  const count = await refreshAdAccounts(storeId, accessToken);
  return { me, accounts: count };
}
