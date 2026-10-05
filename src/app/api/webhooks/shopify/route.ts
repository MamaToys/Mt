import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { errorMessage } from "@/lib/http";
import { verifyShopifyWebhookHmac } from "@/lib/shopify/oauth";
import { deleteOrder, syncSingleOrder } from "@/lib/shopify/sync";
import { rebuildForDates } from "@/lib/sync/rollup";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Shopify webhooks (orders/create, orders/updated, orders/cancelled,
 * orders/delete, refunds/create). The payload is only used to learn WHICH
 * order changed; the order is then re-fetched through the Admin API and
 * upserted, so webhooks and scheduled syncs share one code path and can't
 * double count. Idempotent on X-Shopify-Webhook-Id.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyShopifyWebhookHmac(raw, req.headers.get("x-shopify-hmac-sha256"))) {
    return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
  }
  const topic = req.headers.get("x-shopify-topic") ?? "";
  const shop = req.headers.get("x-shopify-shop-domain") ?? "";
  const webhookId = req.headers.get("x-shopify-webhook-id") ?? req.headers.get("x-shopify-event-id");
  const conn = await db.shopifyConnection.findUnique({ where: { shopDomain: shop }, include: { store: true } });
  if (!conn || conn.status === "DISCONNECTED") return NextResponse.json({ ok: true, ignored: "unknown shop" });

  let payload: { id?: number | string; order_id?: number | string };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const orderId = String(topic.startsWith("refunds/") ? payload.order_id : payload.id);
  if (!orderId || orderId === "undefined") return NextResponse.json({ ok: true, ignored: "no order id" });

  if (webhookId) {
    try {
      await db.webhookEvent.create({ data: { storeId: conn.storeId, externalId: webhookId, topic, resourceId: orderId } });
    } catch {
      return NextResponse.json({ ok: true, duplicate: true }); // already received
    }
  }

  // Respond within Shopify's 5 s window; process after the response is sent.
  after(async () => {
    try {
      const tz = conn.store.timezone;
      const dates =
        topic === "orders/delete"
          ? await deleteOrder(conn.storeId, orderId)
          : await syncSingleOrder(conn.storeId, { shopDomain: conn.shopDomain, accessToken: decryptSecret(conn.accessTokenEnc) }, orderId, tz);
      if (conn.initialImportCompletedAt && dates.size) await rebuildForDates(conn.storeId, dates, "webhook");
      if (webhookId) await db.webhookEvent.update({ where: { externalId: webhookId }, data: { processedAt: new Date() } });
    } catch (e) {
      if (webhookId) await db.webhookEvent.update({ where: { externalId: webhookId }, data: { error: errorMessage(e).slice(0, 1000) } }).catch(() => {});
      console.error("Shopify webhook processing failed", e);
    }
  });
  return NextResponse.json({ ok: true });
}
