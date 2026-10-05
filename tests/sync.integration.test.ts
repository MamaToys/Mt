/**
 * End-to-end sync tests against a real PostgreSQL database with mocked
 * Shopify / Meta HTTP APIs. Skipped unless TEST_DATABASE_URL is set:
 *
 *   TEST_DATABASE_URL=postgresql://…/profit_test npm test
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import type { GqlOrder } from "@/lib/shopify/normalize";

const TEST_DB = process.env.TEST_DATABASE_URL;
const d = TEST_DB ? describe : describe.skip;

process.env.DATABASE_URL = TEST_DB ?? process.env.DATABASE_URL;
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.SHOPIFY_CLIENT_SECRET = "test-secret";

type Mods = {
  db: typeof import("@/lib/db").db;
  crypto: typeof import("@/lib/crypto");
  shopify: typeof import("@/lib/shopify/sync");
  meta: typeof import("@/lib/meta/sync");
  rollup: typeof import("@/lib/sync/rollup");
  queries: typeof import("@/lib/reports/queries");
  dates: typeof import("@/lib/metrics/dates");
  oauth: typeof import("@/lib/shopify/oauth");
  integrations: typeof import("@/lib/integrations");
  timezone: typeof import("@/lib/sync/timezone");
};
let M: Mods;
let storeId: string;
const TZ = "Asia/Muscat";

const money = (a: number) => ({ shopMoney: { amount: a.toFixed(2), currencyCode: "USD" } });

// ── Mock Shopify state ──
let shopOrders: Record<string, GqlOrder> = {};
function makeOrder(id: string, processedAt: string, updatedAt = processedAt): GqlOrder {
  return {
    id: `gid://shopify/Order/${id}`, name: `#${id}`, number: Number(id), createdAt: processedAt, updatedAt, processedAt,
    cancelledAt: null, cancelReason: null, closedAt: null, test: false, sourceName: "web", displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "FULFILLED", currencyCode: "USD", subtotalPriceSet: money(100), totalPriceSet: money(115),
    totalDiscountsSet: money(0), totalTaxSet: money(5), totalShippingPriceSet: money(10), totalRefundedSet: money(0),
    netPaymentSet: money(115), currentTotalPriceSet: money(115),
    customerJourneySummary: { lastVisit: { landingPage: "/", utmParameters: { source: "facebook", medium: "paid", campaign: "c1", term: null, content: null } } },
    lineItems: {
      nodes: [{
        id: `gid://shopify/LineItem/${id}1`, title: "Toy", variantTitle: null, sku: "TOY", quantity: 2, isGiftCard: false,
        product: { id: "gid://shopify/Product/p1" }, variant: { id: "gid://shopify/ProductVariant/v1", inventoryItem: { unitCost: { amount: "20.00" } } },
        originalUnitPriceSet: money(50), discountAllocations: [],
      }],
    },
    refunds: [],
  };
}

// ── Mock Meta state ──
let metaCurrency = "USD";
const metaCalls: string[] = [];

function eachDate(since: string, until: string) {
  const out: string[] = [];
  for (let t = new Date(`${since}T00:00:00Z`); t <= new Date(`${until}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1)) out.push(t.toISOString().slice(0, 10));
  return out;
}

function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
  if (url.hostname.endsWith("myshopify.com")) {
    const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, string> };
    if (body.query.includes("query OrderIds")) {
      const since = /updated_at:>='([^']+)'/.exec(body.variables.query)?.[1] ?? "1970-01-01";
      const nodes = Object.values(shopOrders)
        .filter((o) => o.updatedAt >= since)
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
        .map((o) => ({ id: o.id, updatedAt: o.updatedAt }));
      return json({ data: { orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } });
    }
    if (body.query.includes("query OrderDetail")) {
      const o = shopOrders[body.variables.id.split("/").pop()!];
      return json({ data: { order: o ? { ...o, lineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: o.lineItems.nodes } } : null } });
    }
    if (body.query.includes("query Shop")) return json({ data: { shop: { name: url.hostname, currencyCode: "USD", ianaTimezone: TZ, myshopifyDomain: url.hostname } } });
    if (body.query.includes("query Variants")) return json({ data: { productVariants: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } });
    throw new Error(`Unmocked Shopify query: ${body.query.slice(0, 50)}`);
  }
  if (url.hostname === "graph.facebook.com") {
    metaCalls.push(url.pathname + url.search);
    const path = url.pathname.split("/").slice(2).join("/");
    if (path === "me/adaccounts") return json({ data: [{ id: "act_1", name: "Test account", currency: metaCurrency, timezone_name: TZ, account_status: 1 }] });
    if (path === "act_1/campaigns") return json({ data: [{ id: "c1", name: "Campaign One", status: "ACTIVE", effective_status: "ACTIVE" }, { id: "c2", name: "Campaign Two", status: "PAUSED", effective_status: "PAUSED" }] });
    if (path === "act_1/adsets") return json({ data: [{ id: "s1", name: "Set", campaign_id: "c1" }] });
    if (path === "act_1/ads") return json({ data: [{ id: "a1", name: "Ad", adset_id: "s1" }] });
    if (path === "act_1/insights") {
      const level = url.searchParams.get("level");
      const { since, until } = JSON.parse(url.searchParams.get("time_range")!) as { since: string; until: string };
      const rows = eachDate(since, until).flatMap((date) => {
        const base = { date_start: date, date_stop: date, impressions: "1000", clicks: "20", inline_link_clicks: "10" };
        const p = (spend: number, purch: number) => ({ ...base, spend: spend.toFixed(2), actions: [{ action_type: "omni_purchase", value: String(purch) }], action_values: [{ action_type: "omni_purchase", value: (purch * 50).toFixed(2) }] });
        if (level === "account") return [p(100, 3)];
        if (level === "campaign") return [{ ...p(60, 2), campaign_id: "c1" }, { ...p(40, 1), campaign_id: "c2" }];
        if (level === "adset") return [{ ...p(60, 2), campaign_id: "c1", adset_id: "s1" }];
        return [{ ...p(60, 2), campaign_id: "c1", adset_id: "s1", ad_id: "a1" }];
      });
      return json({ data: rows });
    }
    throw new Error(`Unmocked Meta path: ${path}`);
  }
  throw new Error(`Unexpected fetch: ${url.href}`);
}

d("sync engine (Postgres + mocked APIs)", () => {
  beforeAll(async () => {
    vi.stubGlobal("fetch", vi.fn(mockFetch));
    M = {
      db: (await import("@/lib/db")).db,
      crypto: await import("@/lib/crypto"),
      shopify: await import("@/lib/shopify/sync"),
      meta: await import("@/lib/meta/sync"),
      rollup: await import("@/lib/sync/rollup"),
      queries: await import("@/lib/reports/queries"),
      dates: await import("@/lib/metrics/dates"),
      oauth: await import("@/lib/shopify/oauth"),
      integrations: await import("@/lib/integrations"),
      timezone: await import("@/lib/sync/timezone"),
    };
  });

  beforeEach(async () => {
    await M.db.store.deleteMany({ where: { name: { in: ["TEST STORE", "OTHER STORE"] } } });
    const store = await M.db.store.create({ data: { name: "TEST STORE", currency: "USD", timezone: TZ } });
    storeId = store.id;
    await M.db.shopifyConnection.create({
      data: { storeId, shopDomain: `t-${storeId}.myshopify.com`, accessTokenEnc: M.crypto.encryptSecret("shpat_x"), scopes: "read_orders,read_all_orders", status: "ACTIVE" },
    });
    shopOrders = {};
    metaCurrency = "USD";
  });

  afterAll(async () => {
    await M?.db.store.deleteMany({ where: { name: { in: ["TEST STORE", "OTHER STORE"] } } });
    await M?.db.$disconnect();
    vi.unstubAllGlobals();
  });

  const twoDaysAgo = () => new Date(Date.now() - 2 * 86_400_000).toISOString().replace(/\.\d+Z$/, "Z");

  it("imports orders once: re-syncs never create duplicate orders, lines or refunds", async () => {
    const t = twoDaysAgo();
    shopOrders = { "1001": makeOrder("1001", t), "1002": makeOrder("1002", t) };
    const r1 = await M.shopify.syncShopifyOrders(storeId, { trigger: "test" });
    expect(r1).toMatchObject({ ok: true, complete: true, ordersProcessed: 2 });
    // Run again (cursor overlap re-reads both orders) and again after a forced full re-read.
    await M.shopify.syncShopifyOrders(storeId, { trigger: "test" });
    await M.db.shopifyConnection.update({ where: { storeId }, data: { ordersSyncedThrough: new Date("2000-01-01") } });
    await M.shopify.syncShopifyOrders(storeId, { trigger: "test" });
    expect(await M.db.shopifyOrder.count({ where: { storeId } })).toBe(2);
    expect(await M.db.shopifyOrderLineItem.count({ where: { order: { storeId } } })).toBe(2);

    // A partial refund arrives (order updated) — synced twice, stored once.
    const later = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    shopOrders["1001"] = {
      ...makeOrder("1001", t, later),
      displayFinancialStatus: "PARTIALLY_REFUNDED",
      refunds: [{
        id: "gid://shopify/Refund/9", createdAt: later, note: null, totalRefundedSet: money(52.5),
        refundShippingLines: { nodes: [] },
        refundLineItems: { nodes: [{ id: "gid://shopify/RefundLineItem/91", quantity: 1, restockType: "RETURN", lineItem: { id: "gid://shopify/LineItem/10011" }, subtotalSet: money(50), totalTaxSet: money(2.5) }] },
      }],
    };
    await M.shopify.syncShopifyOrders(storeId, { trigger: "test" });
    await M.shopify.syncShopifyOrders(storeId, { trigger: "test" });
    expect(await M.db.shopifyRefund.count({ where: { order: { storeId } } })).toBe(1);
    expect(await M.db.shopifyRefundLineItem.count({ where: { refund: { order: { storeId } } } })).toBe(1);

    // Rollup: gross 200, returns 50 on the refund date → net 150 overall.
    await M.rollup.rebuildAll(storeId, "test");
    const orderDate = M.dates.localDateOf(new Date(t), TZ);
    const refundDate = M.dates.localDateOf(new Date(later), TZ);
    const res = await M.queries.loadDailyRows(storeId, { from: orderDate, to: refundDate });
    const total = res.rows.reduce((s, r) => s + (r.netSales ?? 0), 0);
    expect(total).toBeCloseTo(150);
    const day = res.rows.find((r) => r.date === orderDate)!;
    expect(day.grossSales).toBeCloseTo(200);
    expect(day.orders).toBe(2);
    expect(day.productCost).toBeCloseTo(80); // 4 units × 20 from Shopify cost per item snapshot
    expect(res.rows.find((r) => r.date === refundDate)!.returns).toBeCloseTo(50);
    // Meta not connected → Meta metrics unavailable (null), never 0.
    expect(day.metaSpend).toBeNull();
    expect(day.hasMetaData).toBe(false);
  });

  it("an older (delayed) payload never overwrites newer order data", async () => {
    const t = twoDaysAgo();
    const newer = makeOrder("2001", t, new Date().toISOString());
    newer.displayFinancialStatus = "REFUNDED";
    await M.shopify.upsertOrder(storeId, (await import("@/lib/shopify/normalize")).normalizeOrder(newer, TZ), TZ);
    await M.shopify.upsertOrder(storeId, (await import("@/lib/shopify/normalize")).normalizeOrder(makeOrder("2001", t, t), TZ), TZ);
    const o = await M.db.shopifyOrder.findFirstOrThrow({ where: { storeId, externalId: "2001" } });
    expect(o.financialStatus).toBe("REFUNDED");
  });

  it("stores Meta insights without duplicates and totals spend from one level only", async () => {
    await M.db.metaConnection.create({ data: { storeId, accessTokenEnc: M.crypto.encryptSecret("meta-token"), status: "ACTIVE" } });
    await M.meta.refreshAdAccounts(storeId, "meta-token"); // single account → auto-selected
    const r1 = await M.meta.syncMeta(storeId, "daily", { trigger: "test" });
    expect(r1.ok).toBe(true);
    const count1 = await M.db.metaDailyInsight.count({ where: { adAccount: { storeId } } });
    await M.meta.syncMeta(storeId, "recent", { trigger: "test" });
    await M.meta.syncMeta(storeId, "daily", { trigger: "test" });
    expect(await M.db.metaDailyInsight.count({ where: { adAccount: { storeId } } })).toBe(count1);

    const acct = await M.db.metaAdAccount.findFirstOrThrow({ where: { storeId } });
    const today = M.dates.todayIn(TZ);
    expect(M.dates.fromDbDate(acct.insightsThrough!)).toBe(today);
    expect(M.dates.fromDbDate(acct.insightsFrom!)).toBe(M.dates.addDays(today, -28));

    await M.rollup.rebuildAll(storeId, "test");
    const res = await M.queries.loadDailyRows(storeId, { from: M.dates.addDays(today, -3), to: M.dates.addDays(today, -1) });
    for (const r of res.rows) {
      expect(r.metaSpend).toBeCloseTo(100); // account level (60 + 40 campaign rows are NOT added on top)
      expect(r.metaPurchaseValue).toBeCloseTo(150);
    }
    const camps = await M.queries.loadCampaigns(storeId, { from: M.dates.addDays(today, -3), to: M.dates.addDays(today, -1) });
    expect(camps.rows.find((c) => c.campaignId === "c1")!.spend).toBeCloseTo(180);
    // Shopify store without completed import → Shopify side unavailable even though Meta is present.
    expect(res.rows[0].netSales).toBeNull();
  });

  it("never mixes currencies: a EUR ad account is unavailable until a rate exists", async () => {
    metaCurrency = "EUR";
    await M.db.metaConnection.create({ data: { storeId, accessTokenEnc: M.crypto.encryptSecret("meta-token"), status: "ACTIVE" } });
    await M.meta.refreshAdAccounts(storeId, "meta-token");
    await M.meta.syncMeta(storeId, "daily", { trigger: "test" });
    await M.rollup.rebuildAll(storeId, "test");
    const today = M.dates.todayIn(TZ);
    const day = M.dates.addDays(today, -1);
    let rows = (await M.queries.loadDailyRows(storeId, { from: day, to: day })).rows;
    expect(rows[0].metaSpend).toBeNull();
    expect(rows[0].metaFxMissing).toBe(true);

    await M.db.exchangeRate.create({ data: { storeId, base: "EUR", quote: "USD", date: M.dates.toDbDate(M.dates.addDays(today, -40)), rate: 1.1 } });
    await M.db.exchangeRate.create({ data: { storeId, base: "EUR", quote: "USD", date: M.dates.toDbDate(M.dates.addDays(today, -7)), rate: 1.1 } });
    await M.rollup.rebuildAll(storeId, "test");
    rows = (await M.queries.loadDailyRows(storeId, { from: day, to: day })).rows;
    expect(rows[0].metaSpend).toBeCloseTo(110);
    expect(rows[0].metaFxMissing).toBe(false);
  });

  it("verifies Shopify webhook HMAC", () => {
    const body = JSON.stringify({ id: 1 });
    const good = M.crypto.hmacSha256("test-secret", body, "base64");
    expect(M.oauth.verifyShopifyWebhookHmac(body, good, "test-secret")).toBe(true);
    expect(M.oauth.verifyShopifyWebhookHmac(body + " ", good, "test-secret")).toBe(false);
    expect(M.oauth.verifyShopifyWebhookHmac(body, null, "test-secret")).toBe(false);
  });

  it("verifies Shopify OAuth query HMAC", () => {
    const p = new URLSearchParams({ code: "abc", shop: "x.myshopify.com", state: "s", timestamp: "1" });
    const msg = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
    p.set("hmac", M.crypto.hmacSha256("test-secret", msg, "hex"));
    expect(M.oauth.verifyShopifyQueryHmac(p, "test-secret")).toBe(true);
    p.set("shop", "evil.myshopify.com");
    expect(M.oauth.verifyShopifyQueryHmac(p, "test-secret")).toBe(false);
  });

  it("exchange rates are per store: another tenant's rate never converts this store's spend", async () => {
    metaCurrency = "EUR";
    const other = await M.db.store.create({ data: { name: "OTHER STORE", currency: "USD", timezone: TZ } });
    const today = M.dates.todayIn(TZ);
    await M.db.exchangeRate.create({ data: { storeId: other.id, base: "EUR", quote: "USD", date: M.dates.toDbDate(M.dates.addDays(today, -3)), rate: 100 } });
    await M.db.metaConnection.create({ data: { storeId, accessTokenEnc: M.crypto.encryptSecret("meta-token"), status: "ACTIVE" } });
    await M.meta.refreshAdAccounts(storeId, "meta-token");
    await M.meta.syncMeta(storeId, "daily", { trigger: "test" });
    await M.rollup.rebuildAll(storeId, "test");
    const day = M.dates.addDays(today, -1);
    const rows = (await M.queries.loadDailyRows(storeId, { from: day, to: day })).rows;
    expect(rows[0].metaSpend).toBeNull();
  });

  it("connecting a different Shopify shop resets the cursor and drops the previous shop's orders", async () => {
    const t = twoDaysAgo();
    shopOrders = { "3001": makeOrder("3001", t) };
    await M.shopify.syncShopifyOrders(storeId, { trigger: "test" });
    expect(await M.db.shopifyOrder.count({ where: { storeId } })).toBe(1);
    shopOrders = { "4001": makeOrder("4001", t), "4002": makeOrder("4002", t) };
    await M.integrations.saveShopifyConnection(storeId, `b-${storeId}.myshopify.com`, "shpat_y", "read_orders,read_all_orders");
    const conn = await M.db.shopifyConnection.findUniqueOrThrow({ where: { storeId } });
    expect(conn.ordersSyncedThrough).toBeNull();
    expect(conn.initialImportCompletedAt).toBeNull();
    await M.shopify.syncShopifyOrders(storeId, { trigger: "test" });
    const ids = (await M.db.shopifyOrder.findMany({ where: { storeId }, select: { externalId: true } })).map((o) => o.externalId).sort();
    expect(ids).toEqual(["4001", "4002"]);
  });

  it("changing the store timezone re-buckets every stored order and refund date", async () => {
    // 2026-10-04T21:30Z is Oct 5 in Muscat but Oct 4 in New York.
    shopOrders = { "5001": { ...makeOrder("5001", "2026-10-04T21:30:00Z", new Date().toISOString()), refunds: [{
      id: "gid://shopify/Refund/51", createdAt: "2026-10-05T22:00:00Z", note: null, totalRefundedSet: money(10), refundShippingLines: { nodes: [] },
      refundLineItems: { nodes: [] },
    }] } };
    await M.shopify.syncSingleOrder(storeId, { shopDomain: `t-${storeId}.myshopify.com`, accessToken: "x" }, "5001", TZ);
    let o = await M.db.shopifyOrder.findFirstOrThrow({ where: { storeId, externalId: "5001" }, include: { refunds: true } });
    expect(M.dates.fromDbDate(o.localDate)).toBe("2026-10-05");
    expect(o.localHour).toBe(1);
    expect(M.dates.fromDbDate(o.refunds[0].localDate)).toBe("2026-10-06");
    await M.timezone.rebucketTimezone(storeId, "America/New_York");
    o = await M.db.shopifyOrder.findFirstOrThrow({ where: { storeId, externalId: "5001" }, include: { refunds: true } });
    expect(M.dates.fromDbDate(o.localDate)).toBe("2026-10-04");
    expect(o.localHour).toBe(17);
    expect(M.dates.fromDbDate(o.refunds[0].localDate)).toBe("2026-10-05");
  });
});
