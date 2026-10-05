import "server-only";
import { db } from "../db";
import { errorMessage } from "../http";
import { addDays, todayIn } from "../metrics/dates";
import { syncMeta } from "../meta/sync";
import { syncShopifyOrders, syncShopifyProducts } from "../shopify/sync";
import { runAlerts } from "../alerts/run";
import { rebuildAll, rebuildForDates } from "./rollup";

export type RunMode = "recent" | "daily" | "manual";

export interface RunSummary {
  storeId: string;
  shopify?: { ok: boolean; orders: number; complete: boolean; error?: string };
  meta?: { ok: boolean; rows: number; error?: string };
  rollupDays: number;
  alerts: number;
  errors: string[];
}

/**
 * One sync cycle for a store. Shopify and Meta run independently (one failing
 * never blocks the other), then affected days are re-rolled up and alerts
 * re-evaluated.
 */
export async function runStoreSync(storeId: string, mode: RunMode, trigger: string, timeBudgetMs = 240_000): Promise<RunSummary> {
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId }, include: { shopifyConnection: true, metaConnection: true } });
  const summary: RunSummary = { storeId, rollupDays: 0, alerts: 0, errors: [] };
  const today = todayIn(store.timezone);
  const affected = new Set<string>([today]); // expenses accrue daily even without orders
  let fullRebuild = false;

  const shopifyTask = store.shopifyConnection
    ? (async () => {
        const wasInitial = !store.shopifyConnection!.initialImportCompletedAt;
        if (mode !== "recent" || !store.shopifyConnection!.productsSyncedAt) await syncShopifyProducts(storeId, trigger);
        const r = await syncShopifyOrders(storeId, { trigger, timeBudgetMs });
        summary.shopify = { ok: r.ok, orders: r.ordersProcessed, complete: r.complete, error: r.error };
        if (wasInitial && r.complete) fullRebuild = true;
        r.affectedDates.forEach((d) => affected.add(d));
        if (!r.ok && r.error) summary.errors.push(`Shopify: ${r.error}`);
      })()
    : Promise.resolve();

  const metaTask = store.metaConnection
    ? (async () => {
        const r = await syncMeta(storeId, mode === "recent" ? "recent" : "daily", { trigger, timeBudgetMs: timeBudgetMs / 2 });
        let rows = r.rows;
        if (r.affectedRange) {
          affected.add(r.affectedRange.from);
          affected.add(r.affectedRange.to);
        }
        if (mode !== "recent") {
          // Backfill older history with what's left of the budget.
          const h = await syncMeta(storeId, "history", { trigger, timeBudgetMs: timeBudgetMs / 2 });
          rows += h.rows;
          if (h.affectedRange) {
            affected.add(h.affectedRange.from);
            affected.add(h.affectedRange.to);
          }
        }
        summary.meta = { ok: r.ok, rows, error: r.error };
        if (!r.ok && r.error) summary.errors.push(`Meta: ${r.error}`);
      })()
    : Promise.resolve();

  const settled = await Promise.allSettled([shopifyTask, metaTask]);
  for (const s of settled) if (s.status === "rejected") summary.errors.push(errorMessage(s.reason));

  try {
    if (mode === "daily") {
      // Daily: restate the last 35 days (Meta attribution window + late refunds).
      affected.add(addDays(today, -35));
    }
    summary.rollupDays = fullRebuild ? await rebuildAll(storeId, trigger) : await rebuildForDates(storeId, affected, trigger);
  } catch (e) {
    summary.errors.push(`Rollup: ${errorMessage(e)}`);
  }
  try {
    summary.alerts = await runAlerts(storeId);
  } catch (e) {
    summary.errors.push(`Alerts: ${errorMessage(e)}`);
  }
  return summary;
}

export async function runAllStores(mode: RunMode, trigger: string): Promise<RunSummary[]> {
  const stores = await db.store.findMany({
    where: { isDemo: false, OR: [{ shopifyConnection: { isNot: null } }, { metaConnection: { isNot: null } }] },
    select: { id: true },
  });
  const out: RunSummary[] = [];
  const perStore = Math.max(60_000, Math.floor(240_000 / Math.max(1, stores.length)));
  for (const s of stores) out.push(await runStoreSync(s.id, mode, trigger, perStore));
  return out;
}
