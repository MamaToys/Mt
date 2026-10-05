"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStore, canEdit } from "@/lib/session";
import { isDateStr, isValidTimeZone, toDbDate } from "@/lib/metrics/dates";
import { rebuildAll } from "@/lib/sync/rollup";
import { saveMetaConnection, saveShopifyConnection } from "@/lib/integrations";
import { normalizeShopDomain } from "@/lib/shopify/client";
import { runStoreSync } from "@/lib/sync/orchestrator";
import { errorMessage } from "@/lib/http";

export type ActionResult = { ok: boolean; message?: string };

async function editor() {
  const ctx = await requireStore();
  if (!canEdit(ctx.role)) throw new Error("You don't have permission to change this store.");
  return ctx;
}

const dec = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : new Prisma.Decimal(v));
const optNum = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().finite().nullable());
const reqNum = z.preprocess((v) => (v === "" || v === null || v === undefined ? 0 : Number(v)), z.number().finite());
const dateStr = z.string().refine(isDateStr, "Invalid date");

/** Recompute all rollups after anything that changes profit (settings, costs, expenses, FX). */
function scheduleRebuild(storeId: string) {
  after(() => rebuildAll(storeId, "settings_change").then(() => undefined).catch((e) => console.error("rebuild failed", e)));
}

// ───────────────────────────── Settings ─────────────────────────────

const SettingsSchema = z.object({
  name: z.string().min(1).max(120),
  currency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().refine(isValidTimeZone, "Unknown timezone"),
  weekStartsOn: z.coerce.number().int().min(0).max(1),
  paymentFeePercent: reqNum.pipe(z.number().min(0).max(100)),
  paymentFeeFixed: reqNum.pipe(z.number().min(0)),
  shippingCostMode: z.enum(["NONE", "PER_ORDER", "EQUAL_TO_CHARGED", "PERCENT_OF_NET_SALES"]),
  shippingCostPerOrder: reqNum.pipe(z.number().min(0)),
  shippingCostPercent: reqNum.pipe(z.number().min(0).max(100)),
  breakEvenMode: z.enum(["AUTO", "MANUAL"]),
  manualContributionMarginPct: optNum,
  targetRoas: optNum,
  targetCpa: optNum,
  targetProfitMarginPct: optNum,
  targetMonthlySales: optNum,
  targetMonthlyProfit: optNum,
  alertDiscrepancyPct: reqNum,
  alertCampaignSpendNoPurch: reqNum,
  alertCampaignDailySpendMax: optNum,
  alertCpaIncreasePct: reqNum,
  alertSalesDeclinePct: reqNum,
  alertRefundRatePct: reqNum,
  utmAttributionEnabled: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export async function saveSettings(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const { store } = await editor();
    const p = SettingsSchema.safeParse(Object.fromEntries(form.entries()));
    if (!p.success) return { ok: false, message: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    const s = p.data;
    if (s.breakEvenMode === "MANUAL" && (s.manualContributionMarginPct === null || s.manualContributionMarginPct <= 0 || s.manualContributionMarginPct >= 100)) {
      return { ok: false, message: "Manual contribution margin must be between 0 and 100 %." };
    }
    const conn = await db.shopifyConnection.findUnique({ where: { storeId: store.id } });
    if (conn?.shopCurrency && conn.shopCurrency !== s.currency) {
      const rate = await db.exchangeRate.findFirst({
        where: { OR: [{ base: conn.shopCurrency, quote: s.currency }, { base: s.currency, quote: conn.shopCurrency }] },
      });
      if (!rate) return { ok: false, message: `Reporting currency ${s.currency} differs from the Shopify currency ${conn.shopCurrency}. Add an exchange rate first (Integrations → Exchange rates).` };
    }
    await db.store.update({ where: { id: store.id }, data: { name: s.name, currency: s.currency, timezone: s.timezone, weekStartsOn: s.weekStartsOn } });
    await db.storeSettings.upsert({
      where: { storeId: store.id },
      create: { storeId: store.id },
      update: {
        paymentFeePercent: dec(s.paymentFeePercent)!,
        paymentFeeFixed: dec(s.paymentFeeFixed)!,
        shippingCostMode: s.shippingCostMode,
        shippingCostPerOrder: dec(s.shippingCostPerOrder)!,
        shippingCostPercent: dec(s.shippingCostPercent)!,
        breakEvenMode: s.breakEvenMode,
        manualContributionMargin: s.manualContributionMarginPct === null ? null : dec(s.manualContributionMarginPct / 100),
        targetRoas: dec(s.targetRoas),
        targetCpa: dec(s.targetCpa),
        targetProfitMargin: s.targetProfitMarginPct === null ? null : dec(s.targetProfitMarginPct / 100),
        targetMonthlySales: dec(s.targetMonthlySales),
        targetMonthlyProfit: dec(s.targetMonthlyProfit),
        alertDiscrepancyPct: dec(s.alertDiscrepancyPct)!,
        alertCampaignSpendNoPurch: dec(s.alertCampaignSpendNoPurch)!,
        alertCampaignDailySpendMax: dec(s.alertCampaignDailySpendMax),
        alertCpaIncreasePct: dec(s.alertCpaIncreasePct)!,
        alertSalesDeclinePct: dec(s.alertSalesDeclinePct)!,
        alertRefundRatePct: dec(s.alertRefundRatePct)!,
        utmAttributionEnabled: s.utmAttributionEnabled,
      },
    });
    scheduleRebuild(store.id);
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved. Metrics are being recalculated." };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

// ───────────────────────────── Expenses ─────────────────────────────

const ExpenseSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  category: z.enum(["GOOGLE_ADS", "TIKTOK_ADS", "OTHER_ADVERTISING", "INFLUENCER", "AGENCY", "SOFTWARE", "WAREHOUSE", "PACKAGING", "SHIPPING", "PAYMENT_FEES", "SALARIES", "OTHER"]),
  type: z.enum(["FIXED", "PERCENTAGE"]),
  frequency: z.enum(["ONE_TIME", "DAILY", "MONTHLY"]),
  amount: optNum,
  percent: optNum,
  percentBase: z.enum(["NET_SALES", "GROSS_SALES", "TOTAL_SALES", "META_SPEND"]).optional(),
  startDate: dateStr,
  endDate: z.union([dateStr, z.literal("")]).optional(),
  notes: z.string().max(500).optional(),
});

export async function saveExpense(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const { store } = await editor();
    const p = ExpenseSchema.safeParse(Object.fromEntries(form.entries()));
    if (!p.success) return { ok: false, message: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    const e = p.data;
    if (e.type === "FIXED" && (e.amount === null || e.amount < 0)) return { ok: false, message: "Enter a fixed amount ≥ 0." };
    if (e.type === "PERCENTAGE" && (e.percent === null || e.percent < 0 || e.percent > 100 || !e.percentBase)) return { ok: false, message: "Enter a percentage (0–100) and what it is a percentage of." };
    if (e.endDate && e.endDate < e.startDate) return { ok: false, message: "End date is before start date." };
    const data = {
      name: e.name,
      category: e.category,
      type: e.type,
      frequency: e.frequency,
      amount: e.type === "FIXED" ? dec(e.amount) : null,
      percent: e.type === "PERCENTAGE" ? dec(e.percent) : null,
      percentBase: e.type === "PERCENTAGE" ? e.percentBase! : null,
      currency: store.currency, // expenses are always entered in the reporting currency
      startDate: toDbDate(e.startDate),
      endDate: e.endDate ? toDbDate(e.endDate) : null,
      notes: e.notes || null,
    };
    if (e.id) await db.expense.update({ where: { id: e.id, storeId: store.id }, data });
    else await db.expense.create({ data: { storeId: store.id, ...data } });
    scheduleRebuild(store.id);
    revalidatePath("/expenses");
    return { ok: true, message: "Expense saved." };
  } catch (err) {
    return { ok: false, message: errorMessage(err) };
  }
}

export async function deleteExpense(id: string): Promise<void> {
  const { store } = await editor();
  await db.expense.delete({ where: { id, storeId: store.id } });
  scheduleRebuild(store.id);
  revalidatePath("/expenses");
}

// ───────────────────────────── Product costs ─────────────────────────────

const CostSchema = z.object({
  variantExternalId: z.string().optional(),
  productExternalId: z.string().optional(),
  sku: z.string().max(255).optional(),
  title: z.string().max(255).optional(),
  costPerUnit: reqNum.pipe(z.number().min(0)),
  effectiveFrom: z.union([dateStr, z.literal("")]).optional(),
});

/** Manual cost override (wins over Shopify's cost per item). */
export async function saveProductCost(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const { store } = await editor();
    const p = CostSchema.safeParse(Object.fromEntries(form.entries()));
    if (!p.success) return { ok: false, message: p.error.issues.map((i) => i.message).join("; ") };
    const c = p.data;
    if (!c.variantExternalId && !c.sku) return { ok: false, message: "Choose a variant or enter a SKU." };
    const effectiveFrom = toDbDate(c.effectiveFrom || "1970-01-01");
    const where = { storeId: store.id, source: "MANUAL" as const, effectiveFrom, ...(c.variantExternalId ? { variantExternalId: c.variantExternalId } : { variantExternalId: null, sku: c.sku }) };
    const existing = await db.productCost.findFirst({ where });
    const data = { costPerUnit: new Prisma.Decimal(c.costPerUnit), currency: store.currency, sku: c.sku || null, title: c.title || null, productExternalId: c.productExternalId || null };
    if (existing) await db.productCost.update({ where: { id: existing.id }, data });
    else await db.productCost.create({ data: { ...where, ...data } });
    scheduleRebuild(store.id);
    revalidatePath("/products");
    return { ok: true, message: "Cost saved." };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

export async function deleteProductCost(id: string): Promise<void> {
  const { store } = await editor();
  await db.productCost.delete({ where: { id, storeId: store.id, source: "MANUAL" } });
  scheduleRebuild(store.id);
  revalidatePath("/products");
}

// ───────────────────────────── Exchange rates ─────────────────────────────

const FxSchema = z.object({
  base: z.string().regex(/^[A-Z]{3}$/),
  quote: z.string().regex(/^[A-Z]{3}$/),
  date: dateStr,
  rate: reqNum.pipe(z.number().positive()),
});

export async function saveFxRate(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const { store } = await editor();
    const p = FxSchema.safeParse(Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v.toUpperCase().trim() : v])));
    if (!p.success) return { ok: false, message: "Enter two 3-letter currency codes, a date and a positive rate." };
    const { base, quote, date, rate } = p.data;
    if (base === quote) return { ok: false, message: "Currencies must differ." };
    await db.exchangeRate.upsert({
      where: { base_quote_date: { base, quote, date: toDbDate(date) } },
      create: { base, quote, date: toDbDate(date), rate: new Prisma.Decimal(rate), source: "manual" },
      update: { rate: new Prisma.Decimal(rate), source: "manual" },
    });
    scheduleRebuild(store.id);
    revalidatePath("/integrations");
    return { ok: true, message: `Saved 1 ${base} = ${rate} ${quote} from ${date}.` };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

export async function deleteFxRate(id: string): Promise<void> {
  const { store } = await editor();
  await db.exchangeRate.delete({ where: { id } });
  scheduleRebuild(store.id);
  revalidatePath("/integrations");
}

// ───────────────────────────── Connections ─────────────────────────────

export async function connectShopifyWithToken(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const { store } = await editor();
    const shop = normalizeShopDomain(String(form.get("shop") ?? ""));
    const token = String(form.get("token") ?? "").trim();
    if (!shop) return { ok: false, message: "Enter your store's .myshopify.com domain." };
    if (!/^shpat_[A-Za-z0-9]+$/.test(token)) return { ok: false, message: "Enter an Admin API access token (starts with shpat_)." };
    const r = await saveShopifyConnection(store.id, shop, token, String(form.get("scopes") ?? "") || null);
    after(() => runStoreSync(store.id, "manual", "initial_connect").then(() => undefined));
    revalidatePath("/", "layout");
    return { ok: true, message: `Connected ${r.shop.name}. Initial import started.${r.webhookErrors.length ? ` Note: ${r.webhookErrors.join("; ")}` : ""}` };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

export async function connectMetaWithToken(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    const { store } = await editor();
    const token = String(form.get("token") ?? "").trim();
    if (token.length < 20) return { ok: false, message: "Enter a Meta access token with ads_read permission." };
    const r = await saveMetaConnection(store.id, token, null);
    revalidatePath("/", "layout");
    return { ok: true, message: `Connected as ${r.me.name}. Found ${r.accounts} ad account(s) — select which to report on.` };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

export async function setAdAccountSelected(id: string, selected: boolean): Promise<void> {
  const { store } = await editor();
  await db.metaAdAccount.update({ where: { id, storeId: store.id }, data: { isSelected: selected } });
  if (selected) after(() => runStoreSync(store.id, "manual", "account_selected").then(() => undefined));
  else scheduleRebuild(store.id);
  revalidatePath("/integrations");
}

export async function disconnect(platform: "shopify" | "meta"): Promise<void> {
  const { store } = await editor();
  // Tokens are deleted; imported historical data is kept (and reported as stale).
  if (platform === "shopify") await db.shopifyConnection.updateMany({ where: { storeId: store.id }, data: { status: "DISCONNECTED", accessTokenEnc: "" } });
  else await db.metaConnection.updateMany({ where: { storeId: store.id }, data: { status: "DISCONNECTED", accessTokenEnc: "" } });
  revalidatePath("/", "layout");
}

// ───────────────────────────── Alerts ─────────────────────────────

export async function dismissAlert(id: string): Promise<void> {
  const { store } = await requireStore();
  await db.alert.update({ where: { id, storeId: store.id }, data: { dismissedAt: new Date() } });
  revalidatePath("/", "layout");
}
