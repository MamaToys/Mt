import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { decryptSecret } from "../crypto";
import { env } from "../env";
import { ApiError, errorMessage } from "../http";
import { addDays, localDateOf, maxDate, todayIn, toDbDate } from "../metrics/dates";
import { acquireLock, releaseLock } from "../sync/lock";
import { startSyncLog } from "../sync/log";
import { ShopifyCreds, gidToId, orderGid, shopifyGraphql } from "./client";
import { GqlLineItem, GqlOrder, NormalizedOrder, normalizeOrder } from "./normalize";
import {
  ORDER_DETAIL_QUERY,
  ORDER_IDS_QUERY,
  ORDER_LINES_PAGE_QUERY,
  SHOP_QUERY,
  VARIANTS_QUERY,
  WEBHOOK_CREATE_MUTATION,
} from "./queries";

/** Re-read orders updated slightly before the cursor to tolerate clock skew. */
const CURSOR_OVERLAP_MS = 10 * 60 * 1000;
/** Without read_all_orders Shopify only exposes the last 60 days. */
const DEFAULT_ACCESS_DAYS = 60;

export async function getShopifyCreds(storeId: string): Promise<ShopifyCreds | null> {
  const c = await db.shopifyConnection.findUnique({ where: { storeId } });
  if (!c || c.status === "DISCONNECTED") return null;
  return { shopDomain: c.shopDomain, accessToken: decryptSecret(c.accessTokenEnc) };
}

export async function fetchShopInfo(creds: ShopifyCreds) {
  const d = await shopifyGraphql<{ shop: { name: string; currencyCode: string; ianaTimezone: string; myshopifyDomain: string } }>(
    creds,
    SHOP_QUERY,
  );
  return d.shop;
}

/** Fetches one order with all line items. Returns null if it no longer exists. */
export async function fetchOrderDetail(creds: ShopifyCreds, orderId: string): Promise<{ order: GqlOrder; truncatedRefunds: boolean } | null> {
  type Detail = { order: (Omit<GqlOrder, "lineItems"> & { lineItems: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GqlLineItem[] } }) | null };
  const d = await shopifyGraphql<Detail>(creds, ORDER_DETAIL_QUERY, { id: orderGid(orderId) });
  if (!d.order) return null;
  const lines = [...d.order.lineItems.nodes];
  let page = d.order.lineItems.pageInfo;
  while (page.hasNextPage) {
    const more = await shopifyGraphql<{ order: { lineItems: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GqlLineItem[] } } }>(
      creds,
      ORDER_LINES_PAGE_QUERY,
      { id: orderGid(orderId), after: page.endCursor },
    );
    lines.push(...more.order.lineItems.nodes);
    page = more.order.lineItems.pageInfo;
  }
  const truncatedRefunds = d.order.refunds.length >= 10 || d.order.refunds.some((r) => r.refundLineItems.pageInfo?.hasNextPage);
  return { order: { ...d.order, lineItems: { nodes: lines } }, truncatedRefunds };
}

const dec = (n: number | null) => (n === null ? null : new Prisma.Decimal(n.toFixed(4)));

/**
 * Upserts an order keyed by (storeId, Shopify order ID) — re-imports update
 * the same row, so orders are never double counted. Returns the store-local
 * dates whose metrics must be recomputed.
 */
export async function upsertOrder(storeId: string, n: NormalizedOrder, timeZone: string): Promise<Set<string>> {
  const affected = new Set<string>([n.localDate, ...n.refunds.map((r) => r.localDate)]);
  if (n.cancelledAt) affected.add(localDateOf(n.cancelledAt, timeZone));

  await db.$transaction(async (tx) => {
    const existing = await tx.shopifyOrder.findUnique({
      where: { storeId_externalId: { storeId, externalId: n.externalId } },
      select: { id: true, updatedAtShopify: true, localDate: true, cancelledAt: true },
    });
    // Never let an older payload (e.g. a delayed webhook) overwrite newer data.
    if (existing && existing.updatedAtShopify > n.updatedAtShopify) {
      affected.clear();
      return;
    }
    if (existing) {
      affected.add(existing.localDate.toISOString().slice(0, 10));
      if (existing.cancelledAt) affected.add(localDateOf(existing.cancelledAt, timeZone));
    }

    const data = {
      orderNumber: n.orderNumber,
      name: n.name,
      processedAt: n.processedAt,
      createdAtShopify: n.createdAtShopify,
      updatedAtShopify: n.updatedAtShopify,
      cancelledAt: n.cancelledAt,
      cancelReason: n.cancelReason,
      closedAt: n.closedAt,
      test: n.test,
      financialStatus: n.financialStatus,
      fulfillmentStatus: n.fulfillmentStatus,
      currency: n.currency,
      localDate: toDbDate(n.localDate),
      localHour: n.localHour,
      grossSales: dec(n.grossSales)!,
      totalDiscounts: dec(n.totalDiscounts)!,
      subtotalPrice: dec(n.subtotalPrice)!,
      totalShipping: dec(n.totalShipping)!,
      totalTax: dec(n.totalTax)!,
      totalPrice: dec(n.totalPrice)!,
      totalRefunded: dec(n.totalRefunded)!,
      netPayment: dec(n.netPayment),
      currentTotalPrice: dec(n.currentTotalPrice),
      utmSource: n.utmSource,
      utmMedium: n.utmMedium,
      utmCampaign: n.utmCampaign,
      utmTerm: n.utmTerm,
      utmContent: n.utmContent,
      landingPage: n.landingPage,
      sourceName: n.sourceName,
    };
    const order = await tx.shopifyOrder.upsert({
      where: { storeId_externalId: { storeId, externalId: n.externalId } },
      create: { storeId, externalId: n.externalId, ...data },
      update: data,
      select: { id: true },
    });

    const lineIdByExternal = new Map<string, string>();
    for (const l of n.lines) {
      const ldata = {
        productExternalId: l.productExternalId,
        variantExternalId: l.variantExternalId,
        sku: l.sku,
        title: l.title,
        variantTitle: l.variantTitle,
        quantity: l.quantity,
        originalUnitPrice: dec(l.originalUnitPrice)!,
        totalDiscount: dec(l.totalDiscount)!,
        shopifyUnitCost: dec(l.shopifyUnitCost),
        isGiftCard: l.isGiftCard,
      };
      const row = await tx.shopifyOrderLineItem.upsert({
        where: { orderId_externalId: { orderId: order.id, externalId: l.externalId } },
        create: { orderId: order.id, externalId: l.externalId, ...ldata },
        update: ldata,
        select: { id: true },
      });
      lineIdByExternal.set(l.externalId, row.id);
    }
    // Line items removed by an order edit.
    await tx.shopifyOrderLineItem.deleteMany({
      where: { orderId: order.id, externalId: { notIn: n.lines.map((l) => l.externalId) } },
    });

    for (const r of n.refunds) {
      const rdata = {
        processedAt: r.processedAt,
        localDate: toDbDate(r.localDate),
        totalRefunded: dec(r.totalRefunded)!,
        lineItemsSubtotal: dec(r.lineItemsSubtotal)!,
        lineItemsTax: dec(r.lineItemsTax)!,
        shippingRefunded: dec(r.shippingRefunded)!,
        note: r.note,
      };
      const refund = await tx.shopifyRefund.upsert({
        where: { orderId_externalId: { orderId: order.id, externalId: r.externalId } },
        create: { orderId: order.id, externalId: r.externalId, ...rdata },
        update: rdata,
        select: { id: true },
      });
      for (const rl of r.lines) {
        const lineItemId = lineIdByExternal.get(rl.lineItemExternalId);
        if (!lineItemId) continue;
        const rldata = { lineItemId, quantity: rl.quantity, subtotal: dec(rl.subtotal)!, totalTax: dec(rl.totalTax)!, restockType: rl.restockType };
        await tx.shopifyRefundLineItem.upsert({
          where: { refundId_externalId: { refundId: refund.id, externalId: rl.externalId } },
          create: { refundId: refund.id, externalId: rl.externalId, ...rldata },
          update: rldata,
        });
      }
    }
  }, { timeout: 30_000 });

  return affected;
}

export async function deleteOrder(storeId: string, externalId: string): Promise<Set<string>> {
  const o = await db.shopifyOrder.findUnique({ where: { storeId_externalId: { storeId, externalId } }, include: { refunds: true } });
  if (!o) return new Set();
  await db.shopifyOrder.delete({ where: { id: o.id } });
  return new Set([o.localDate.toISOString().slice(0, 10), ...o.refunds.map((r) => r.localDate.toISOString().slice(0, 10))]);
}

/** Fetch + normalise + upsert one order. Used by webhooks and the sync loop. */
export async function syncSingleOrder(storeId: string, creds: ShopifyCreds, orderId: string, timeZone: string): Promise<Set<string>> {
  const detail = await fetchOrderDetail(creds, orderId);
  if (!detail) return deleteOrder(storeId, orderId);
  return upsertOrder(storeId, normalizeOrder(detail.order, timeZone), timeZone);
}

export interface ShopifySyncResult {
  ok: boolean;
  ordersProcessed: number;
  affectedDates: Set<string>;
  complete: boolean;
  error?: string;
}

/**
 * Incremental order sync driven by an `updated_at` cursor (oldest first), so
 * it is safely resumable: if the time budget runs out, the cursor only moves
 * past orders that were fully saved. The very first run is the historical
 * import (cursor = start of history).
 */
export async function syncShopifyOrders(
  storeId: string,
  opts: { trigger: string; timeBudgetMs?: number } = { trigger: "schedule" },
): Promise<ShopifySyncResult> {
  const budget = opts.timeBudgetMs ?? 240_000;
  const started = Date.now();
  const conn = await db.shopifyConnection.findUnique({ where: { storeId }, include: { store: true } });
  if (!conn || conn.status === "DISCONNECTED") return { ok: false, ordersProcessed: 0, affectedDates: new Set(), complete: false, error: "Shopify not connected" };
  if (!(await acquireLock("shopify", storeId, budget + 60_000))) {
    return { ok: true, ordersProcessed: 0, affectedDates: new Set(), complete: false, error: "Another Shopify sync is already running" };
  }

  const initial = !conn.initialImportCompletedAt;
  const log = await startSyncLog(storeId, "SHOPIFY", initial ? "orders_initial" : "orders_incremental", opts.trigger);
  const affected = new Set<string>();
  const tz = conn.store.timezone;
  let processed = 0;
  try {
    const creds: ShopifyCreds = { shopDomain: conn.shopDomain, accessToken: decryptSecret(conn.accessTokenEnc) };

    // Coverage start: requested history, limited to 60 days without read_all_orders.
    let historyFrom = conn.historyFrom ? conn.historyFrom.toISOString().slice(0, 10) : null;
    if (!historyFrom) {
      const today = todayIn(tz);
      const hasAll = (conn.scopes ?? "").split(",").map((s) => s.trim()).includes("read_all_orders") || !!env.shopify.adminAccessToken;
      historyFrom = addDays(today, -(hasAll ? env.initialHistoryDays : DEFAULT_ACCESS_DAYS - 1));
      if (!hasAll) log.detail("note", "read_all_orders scope not granted — history limited to 60 days");
      await db.shopifyConnection.update({ where: { id: conn.id }, data: { historyFrom: toDbDate(historyFrom) } });
    }

    const cursorStart = conn.ordersSyncedThrough
      ? new Date(conn.ordersSyncedThrough.getTime() - CURSOR_OVERLAP_MS)
      : new Date(`${historyFrom}T00:00:00Z`);
    // During the initial import, also bound by processed date so we don't pull years of old orders that were merely edited.
    const search = initial
      ? `updated_at:>='${cursorStart.toISOString()}' AND processed_at:>='${addDays(historyFrom, -1)}'`
      : `updated_at:>='${cursorStart.toISOString()}'`;
    const syncStartedAt = new Date();

    let after: string | null = null;
    let cursor = conn.ordersSyncedThrough;
    let finished = false;
    outer: for (;;) {
      type Page = { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { id: string; updatedAt: string }[] } };
      const page: Page = await shopifyGraphql<Page>(creds, ORDER_IDS_QUERY, { first: 250, after, query: search });
      for (const node of page.orders.nodes) {
        if (Date.now() - started > budget) break outer;
        const id = gidToId(node.id)!;
        const detail = await fetchOrderDetail(creds, id);
        if (detail) {
          if (detail.truncatedRefunds) log.detail(`truncated_refunds_${id}`, "Order has >10 refunds or >20 refund lines; extra refund rows not imported");
          for (const d of await upsertOrder(storeId, normalizeOrder(detail.order, tz), tz)) affected.add(d);
        }
        processed++;
        log.add(1);
        const u = new Date(node.updatedAt);
        if (!cursor || u > cursor) cursor = u;
      }
      if (!page.orders.pageInfo.hasNextPage) {
        finished = true;
        break;
      }
      after = page.orders.pageInfo.endCursor;
    }

    // When every changed order was processed, the data is complete up to when we started listing.
    if (finished) cursor = !cursor || syncStartedAt > cursor ? syncStartedAt : cursor;
    await db.shopifyConnection.update({
      where: { id: conn.id },
      data: {
        ordersSyncedThrough: cursor,
        lastSyncAt: new Date(),
        lastSuccessfulSyncAt: finished ? new Date() : conn.lastSuccessfulSyncAt,
        lastError: null,
        status: "ACTIVE",
        ...(finished && initial ? { initialImportCompletedAt: new Date() } : {}),
      },
    });
    log.detail("complete", finished);
    if (initial && finished) {
      // The whole history must be rolled up once the import completes.
      affected.add(historyFrom);
      affected.add(todayIn(tz));
      log.detail("rollupFromHistoryStart", true);
    }
    await log.finish(finished ? "COMPLETED" : "PARTIAL", finished ? null : "Time budget reached — will continue on next run");
    return { ok: true, ordersProcessed: processed, affectedDates: affected, complete: finished };
  } catch (e) {
    const msg = errorMessage(e);
    await db.shopifyConnection.update({
      where: { id: conn.id },
      data: { lastSyncAt: new Date(), lastError: msg.slice(0, 1000), ...(e instanceof ApiError && e.kind === "auth" ? { status: "EXPIRED" } : { status: "ERROR" }) },
    });
    await log.fail(e);
    return { ok: false, ordersProcessed: processed, affectedDates: affected, complete: false, error: msg };
  } finally {
    await releaseLock("shopify", storeId);
  }
}

/** Imports products/variants and Shopify "cost per item" (as SHOPIFY-source costs). */
export async function syncShopifyProducts(storeId: string, trigger: string): Promise<{ ok: boolean; count: number; error?: string }> {
  const creds = await getShopifyCreds(storeId);
  if (!creds) return { ok: false, count: 0, error: "Shopify not connected" };
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId } });
  const log = await startSyncLog(storeId, "SHOPIFY", "products", trigger);
  let count = 0;
  try {
    let after: string | null = null;
    for (;;) {
      type V = { id: string; sku: string | null; title: string; price: string | null; product: { id: string; title: string; status: string }; inventoryItem: { unitCost: { amount: string } | null } | null };
      type Page = { productVariants: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: V[] } };
      const page: Page = await shopifyGraphql<Page>(creds, VARIANTS_QUERY, { first: 100, after });
      for (const v of page.productVariants.nodes) {
        const productExternalId = gidToId(v.product.id)!;
        const variantExternalId = gidToId(v.id)!;
        const product = await db.shopifyProduct.upsert({
          where: { storeId_externalId: { storeId, externalId: productExternalId } },
          create: { storeId, externalId: productExternalId, title: v.product.title, status: v.product.status },
          update: { title: v.product.title, status: v.product.status },
        });
        const unitCost = v.inventoryItem?.unitCost ? Number(v.inventoryItem.unitCost.amount) : null;
        await db.shopifyVariant.upsert({
          where: { externalId: variantExternalId },
          create: { productId: product.id, externalId: variantExternalId, sku: v.sku, title: v.title, price: v.price ? new Prisma.Decimal(v.price) : null, shopifyUnitCost: dec(unitCost) },
          update: { productId: product.id, sku: v.sku, title: v.title, price: v.price ? new Prisma.Decimal(v.price) : null, shopifyUnitCost: dec(unitCost) },
        });
        if (unitCost !== null) {
          const existing = await db.productCost.findFirst({ where: { storeId, variantExternalId, source: "SHOPIFY" } });
          const data = { productExternalId, sku: v.sku, title: `${v.product.title}${v.title && v.title !== "Default Title" ? ` — ${v.title}` : ""}`, costPerUnit: dec(unitCost)!, currency: store.currency };
          if (existing) await db.productCost.update({ where: { id: existing.id }, data });
          else await db.productCost.create({ data: { storeId, variantExternalId, source: "SHOPIFY", ...data } });
        }
        count++;
      }
      if (!page.productVariants.pageInfo.hasNextPage) break;
      after = page.productVariants.pageInfo.endCursor;
    }
    log.add(count);
    await db.shopifyConnection.update({ where: { storeId }, data: { productsSyncedAt: new Date() } });
    await log.finish();
    return { ok: true, count };
  } catch (e) {
    await log.fail(e);
    return { ok: false, count, error: errorMessage(e) };
  }
}

export const WEBHOOK_TOPICS = ["ORDERS_CREATE", "ORDERS_UPDATED", "ORDERS_CANCELLED", "ORDERS_DELETE", "REFUNDS_CREATE"] as const;

export async function registerShopifyWebhooks(storeId: string): Promise<string[]> {
  const creds = await getShopifyCreds(storeId);
  if (!creds) throw new Error("Shopify not connected");
  const uri = `${env.appUrl}/api/webhooks/shopify`;
  const errors: string[] = [];
  for (const topic of WEBHOOK_TOPICS) {
    const r = await shopifyGraphql<{ webhookSubscriptionCreate: { userErrors: { message: string }[] } }>(creds, WEBHOOK_CREATE_MUTATION, {
      topic,
      sub: { uri, format: "JSON" },
    });
    for (const e of r.webhookSubscriptionCreate.userErrors) {
      // "Address for this topic has already been taken" means it already exists — fine.
      if (!/already been taken/i.test(e.message)) errors.push(`${topic}: ${e.message}`);
    }
  }
  if (errors.length === 0) await db.shopifyConnection.update({ where: { storeId }, data: { webhooksRegisteredAt: new Date() } });
  return errors;
}

/** Store-local dates covered by complete Shopify data. */
export function shopifyCoverage(conn: { historyFrom: Date | null; initialImportCompletedAt: Date | null; ordersSyncedThrough: Date | null } | null, timeZone: string) {
  if (!conn || !conn.initialImportCompletedAt || !conn.historyFrom || !conn.ordersSyncedThrough) return null;
  return { from: conn.historyFrom.toISOString().slice(0, 10), to: maxDate(localDateOf(conn.ordersSyncedThrough, timeZone), conn.historyFrom.toISOString().slice(0, 10)) };
}
