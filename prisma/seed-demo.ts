/**
 * DEVELOPMENT ONLY — creates a clearly-labelled DEMO store (Store.isDemo = true)
 * with generated Shopify orders and Meta insights, attached to an existing user.
 * The UI shows a permanent "DEMO DATA" banner for this store.
 *
 *   npm run db:seed-demo -- you@example.com
 *
 * Never run this against a production database.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { addDays, localDateOf, localHourOf, startOfLocalDay, todayIn, toDbDate } from "../src/lib/metrics/dates";
import { rebuildAll } from "../src/lib/sync/rollup";

const db = new PrismaClient();
const TZ = "Asia/Muscat";
const CURRENCY = "USD";
const DAYS = 120;

// Deterministic PRNG so the demo is reproducible.
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const D = (n: number) => new Prisma.Decimal(n.toFixed(4));

const PRODUCTS = [
  { id: "9001", title: "Wooden Rainbow Stacker", price: 39, cost: 12, variant: "9101" },
  { id: "9002", title: "Plush Bunny", price: 24, cost: 7, variant: "9102" },
  { id: "9003", title: "Montessori Busy Board", price: 69, cost: 26, variant: "9103" },
  { id: "9004", title: "Bath Boat Set", price: 19, cost: 5.5, variant: "9104" },
  { id: "9005", title: "Magnetic Tiles 60pc", price: 89, cost: null, variant: "9105" }, // missing cost on purpose
];

const CAMPAIGNS = [
  { id: "120200000000001", name: "Prospecting – Broad", quality: 1.0 },
  { id: "120200000000002", name: "Retargeting – 30d", quality: 1.7 },
  { id: "120200000000003", name: "Advantage+ Shopping", quality: 1.25 },
  { id: "120200000000004", name: "Test – Video Hooks", quality: 0.35 },
];

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: npm run db:seed-demo -- <email of an existing user>");
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}. Sign up in the app first.`);

  await db.store.deleteMany({ where: { isDemo: true, members: { some: { userId: user.id } } } });
  // Put the demo store first for this user.
  await db.storeMember.deleteMany({ where: { userId: user.id } });
  const store = await db.store.create({
    data: { name: "DEMO – Little Explorers Toys", currency: CURRENCY, timezone: TZ, isDemo: true, members: { create: { userId: user.id, role: "OWNER" } } },
  });
  await db.storeSettings.create({
    data: {
      storeId: store.id, paymentFeePercent: D(2.9), paymentFeeFixed: D(0.3), shippingCostMode: "PER_ORDER", shippingCostPerOrder: D(6),
      targetRoas: D(3), targetProfitMargin: D(0.12), targetMonthlySales: D(60000), targetMonthlyProfit: D(7000),
    },
  });
  const today = todayIn(TZ);
  const from = addDays(today, -(DAYS - 1));

  await db.shopifyConnection.create({
    data: {
      storeId: store.id, shopDomain: `demo-${store.id}.myshopify.com`, accessTokenEnc: "demo", status: "ACTIVE", shopName: "DEMO store",
      shopCurrency: CURRENCY, shopTimezone: TZ, historyFrom: toDbDate(from), ordersSyncedThrough: new Date(),
      initialImportCompletedAt: new Date(), lastSyncAt: new Date(), lastSuccessfulSyncAt: new Date(), productsSyncedAt: new Date(),
    },
  });
  await db.metaConnection.create({
    data: { storeId: store.id, accessTokenEnc: "demo", status: "ACTIVE", metaUserName: "Demo", lastSyncAt: new Date(), lastSuccessfulSyncAt: new Date() },
  });

  for (const p of PRODUCTS) {
    const prod = await db.shopifyProduct.create({ data: { storeId: store.id, externalId: p.id, title: p.title, status: "ACTIVE" } });
    await db.shopifyVariant.create({ data: { productId: prod.id, externalId: p.variant, sku: `SKU-${p.id}`, title: "Default Title", price: D(p.price) } });
    if (p.cost !== null) {
      await db.productCost.create({ data: { storeId: store.id, productExternalId: p.id, variantExternalId: p.variant, sku: `SKU-${p.id}`, title: p.title, costPerUnit: D(p.cost), currency: CURRENCY, source: "SHOPIFY" } });
    }
  }
  await db.expense.createMany({
    data: [
      { storeId: store.id, name: "Shopify + apps", category: "SOFTWARE", type: "FIXED", frequency: "MONTHLY", amount: D(450), currency: CURRENCY, startDate: toDbDate(from) },
      { storeId: store.id, name: "Warehouse", category: "WAREHOUSE", type: "FIXED", frequency: "MONTHLY", amount: D(1800), currency: CURRENCY, startDate: toDbDate(from) },
      { storeId: store.id, name: "Agency fee", category: "AGENCY", type: "PERCENTAGE", frequency: "DAILY", percent: D(8), percentBase: "META_SPEND", currency: CURRENCY, startDate: toDbDate(from) },
      { storeId: store.id, name: "Packaging", category: "PACKAGING", type: "PERCENTAGE", frequency: "DAILY", percent: D(1.5), percentBase: "NET_SALES", currency: CURRENCY, startDate: toDbDate(from) },
    ],
  });

  // Meta structure
  const account = await db.metaAdAccount.create({
    data: { storeId: store.id, externalId: "act_1000000001", name: "DEMO Ad Account", currency: CURRENCY, timezone: TZ, isSelected: true, insightsFrom: toDbDate(from), insightsThrough: toDbDate(today), lastInsightsSyncAt: new Date() },
  });
  for (const c of CAMPAIGNS) {
    const camp = await db.metaCampaign.create({ data: { adAccountId: account.id, externalId: c.id, name: c.name, status: c.quality < 0.5 ? "PAUSED" : "ACTIVE", effectiveStatus: c.quality < 0.5 ? "PAUSED" : "ACTIVE", objective: "OUTCOME_SALES" } });
    for (let s = 1; s <= 2; s++) {
      const set = await db.metaAdSet.create({ data: { adAccountId: account.id, campaignId: camp.id, externalId: `${c.id}${s}`, name: `${c.name} · Ad set ${s}`, status: "ACTIVE", effectiveStatus: "ACTIVE" } });
      for (let a = 1; a <= 2; a++) {
        await db.metaAd.create({ data: { adAccountId: account.id, adSetId: set.id, externalId: `${c.id}${s}${a}`, name: `Creative ${s}.${a}`, status: "ACTIVE", effectiveStatus: "ACTIVE" } });
      }
    }
  }

  let orderNo = 1000;
  const insights: Prisma.MetaDailyInsightCreateManyInput[] = [];
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(from, i);
    const isToday = date === today;
    const season = 1 + 0.25 * Math.sin(i / 9) + i / DAYS / 2;
    const dayFraction = isToday ? localHourOf(new Date(), TZ) / 24 : 1;
    let accSpend = 0, accImp = 0, accClicks = 0, accLink = 0, accPurch = 0, accValue = 0;

    // Campaign-level insights; ad set / ad rows split the campaign evenly-ish so all levels reconcile.
    const campaignOrders: { id: string; n: number }[] = [];
    for (const c of CAMPAIGNS) {
      if (c.quality < 0.5 && i > DAYS - 20) continue; // paused recently
      const spend = (c.quality < 0.5 ? 60 : 180 + rnd() * 140) * season * dayFraction;
      const imp = Math.round(spend * (90 + rnd() * 40));
      const clicks = Math.round(imp * (0.012 + rnd() * 0.01));
      const link = Math.round(clicks * 0.7);
      const purch = Math.max(0, Math.round((spend / 38) * c.quality * (0.8 + rnd() * 0.4)));
      const value = purch * (52 + rnd() * 18);
      campaignOrders.push({ id: c.id, n: Math.round(purch * 0.8) });
      accSpend += spend; accImp += imp; accClicks += clicks; accLink += link; accPurch += purch; accValue += value;
      const base = { adAccountId: account.id, date: toDbDate(date), currency: CURRENCY, purchaseActionType: "omni_purchase" };
      insights.push({ ...base, level: "CAMPAIGN", entityExternalId: c.id, campaignExternalId: c.id, spend: D(spend), impressions: BigInt(imp), clicks: BigInt(clicks), linkClicks: BigInt(link), purchases: D(purch), purchaseValue: D(value), reach: BigInt(Math.round(imp / 1.6)), frequency: D(1.6) });
      for (let s = 1; s <= 2; s++) {
        const share = s === 1 ? 0.6 : 0.4;
        insights.push({ ...base, level: "ADSET", entityExternalId: `${c.id}${s}`, campaignExternalId: c.id, adSetExternalId: `${c.id}${s}`, spend: D(spend * share), impressions: BigInt(Math.round(imp * share)), clicks: BigInt(Math.round(clicks * share)), linkClicks: BigInt(Math.round(link * share)), purchases: D(purch * share), purchaseValue: D(value * share) });
        for (let a = 1; a <= 2; a++) {
          const sh2 = share * (a === 1 ? 0.55 : 0.45);
          insights.push({ ...base, level: "AD", entityExternalId: `${c.id}${s}${a}`, campaignExternalId: c.id, adSetExternalId: `${c.id}${s}`, adExternalId: `${c.id}${s}${a}`, spend: D(spend * sh2), impressions: BigInt(Math.round(imp * sh2)), clicks: BigInt(Math.round(clicks * sh2)), linkClicks: BigInt(Math.round(link * sh2)), purchases: D(purch * sh2), purchaseValue: D(value * sh2) });
        }
      }
    }
    insights.push({ adAccountId: account.id, level: "ACCOUNT", entityExternalId: account.externalId, date: toDbDate(date), currency: CURRENCY, spend: D(accSpend), impressions: BigInt(accImp), clicks: BigInt(accClicks), linkClicks: BigInt(accLink), purchases: D(accPurch), purchaseValue: D(accValue), purchaseActionType: "omni_purchase" });

    // Shopify orders: Meta-attributed (with UTMs) + organic/other.
    const organic = Math.round((12 + rnd() * 10) * season * dayFraction);
    const utmQueue = campaignOrders.flatMap((c) => Array.from({ length: c.n }, () => c.id));
    const total = organic + utmQueue.length;
    const dayStart = startOfLocalDay(date, TZ).getTime();
    const maxMs = (isToday ? Date.now() - dayStart : 86_400_000) - 60_000;
    for (let k = 0; k < total; k++) {
      const processedAt = new Date(dayStart + Math.floor(rnd() * Math.max(60_000, maxMs)));
      const campaignId = k < utmQueue.length ? utmQueue[k] : null;
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 2.2) }, (_, li) => {
        const p = pick(PRODUCTS);
        const qty = 1 + Math.floor(rnd() * 1.6);
        const disc = rnd() < 0.25 ? p.price * qty * 0.1 : 0;
        return { li, p, qty, disc };
      });
      const gross = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
      const disc = lines.reduce((s, l) => s + l.disc, 0);
      const shipping = gross > 75 ? 0 : 6.95;
      const tax = (gross - disc) * 0.05;
      const totalPrice = gross - disc + shipping + tax;
      const cancelled = rnd() < 0.015;
      const refunded = !cancelled && rnd() < 0.05;
      const externalId = String(5_000_000 + orderNo);
      const order = await db.shopifyOrder.create({
        data: {
          storeId: store.id, externalId, orderNumber: orderNo, name: `#${orderNo}`, processedAt, createdAtShopify: processedAt, updatedAtShopify: processedAt,
          cancelledAt: cancelled ? new Date(processedAt.getTime() + 3_600_000) : null, cancelReason: cancelled ? "CUSTOMER" : null,
          test: false, financialStatus: cancelled ? "VOIDED" : refunded ? "PARTIALLY_REFUNDED" : "PAID", fulfillmentStatus: "FULFILLED", currency: CURRENCY,
          localDate: toDbDate(localDateOf(processedAt, TZ)), localHour: localHourOf(processedAt, TZ),
          grossSales: D(gross), totalDiscounts: D(disc), subtotalPrice: D(gross - disc), totalShipping: D(shipping), totalTax: D(tax), totalPrice: D(totalPrice),
          totalRefunded: D(0), utmSource: campaignId ? "facebook" : rnd() < 0.3 ? "google" : null, utmMedium: campaignId ? "paid" : null, utmCampaign: campaignId,
          sourceName: "web",
        },
      });
      orderNo++;
      const created = [];
      for (const l of lines) {
        created.push(await db.shopifyOrderLineItem.create({
          data: { orderId: order.id, externalId: `${externalId}${l.li}`, productExternalId: l.p.id, variantExternalId: l.p.variant, sku: `SKU-${l.p.id}`, title: l.p.title, quantity: l.qty, originalUnitPrice: D(l.p.price), totalDiscount: D(l.disc), shopifyUnitCost: l.p.cost === null ? null : D(l.p.cost) },
        }));
      }
      if (refunded) {
        const l = lines[0];
        const at = new Date(processedAt.getTime() + (1 + Math.floor(rnd() * 6)) * 86_400_000);
        if (at.getTime() < Date.now()) {
          const sub = l.p.price - l.disc / l.qty;
          const refund = await db.shopifyRefund.create({
            data: { orderId: order.id, externalId: `R${externalId}`, processedAt: at, localDate: toDbDate(localDateOf(at, TZ)), totalRefunded: D(sub * 1.05), lineItemsSubtotal: D(sub), lineItemsTax: D(sub * 0.05), shippingRefunded: D(0) },
          });
          await db.shopifyRefundLineItem.create({ data: { refundId: refund.id, lineItemId: created[0].id, externalId: `RL${externalId}`, quantity: 1, subtotal: D(sub), totalTax: D(sub * 0.05), restockType: "RETURN" } });
          await db.shopifyOrder.update({ where: { id: order.id }, data: { totalRefunded: D(sub * 1.05) } });
        }
      }
    }
  }
  for (let i = 0; i < insights.length; i += 1000) await db.metaDailyInsight.createMany({ data: insights.slice(i, i + 1000) });
  const days = await rebuildAll(store.id, "demo_seed");
  console.log(`DEMO store ${store.id} created for ${email}: ${orderNo - 1000} orders, ${insights.length} insight rows, ${days} days rolled up.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
