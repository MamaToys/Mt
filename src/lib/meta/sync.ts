import "server-only";
import { InsightLevel, MetaAdAccount, Prisma } from "@prisma/client";
import { db } from "../db";
import { decryptSecret } from "../crypto";
import { env } from "../env";
import { ApiError, errorMessage } from "../http";
import { addDays, isValidTimeZone, minDate, todayIn, toDbDate } from "../metrics/dates";
import { acquireLock, releaseLock } from "../sync/lock";
import { startSyncLog } from "../sync/log";
import { metaGetAll } from "./client";
import { Level, RawInsight, dateWindows, normalizeInsight } from "./normalize";

export const INSIGHT_FIELDS = [
  "account_id", "account_currency", "campaign_id", "adset_id", "ad_id", "date_start", "date_stop",
  "spend", "impressions", "reach", "frequency", "clicks", "inline_link_clicks", "ctr", "cpc", "cpm",
  "actions", "action_values",
].join(",");

const LEVELS: { level: Level; api: string; window: number }[] = [
  { level: "ACCOUNT", api: "account", window: 90 },
  { level: "CAMPAIGN", api: "campaign", window: 30 },
  { level: "ADSET", api: "adset", window: 30 },
  { level: "AD", api: "ad", window: 14 },
];

/** Meta keeps revising attributed conversions for ~28 days. */
export const META_RESTATEMENT_DAYS = 28;

export async function getMetaToken(storeId: string): Promise<string | null> {
  const c = await db.metaConnection.findUnique({ where: { storeId } });
  if (!c || c.status === "DISCONNECTED") return null;
  return decryptSecret(c.accessTokenEnc);
}

export interface RemoteAdAccount {
  id: string; // act_123
  name: string;
  currency: string;
  timezone_name?: string;
  account_status?: number;
}

export async function listRemoteAdAccounts(token: string): Promise<RemoteAdAccount[]> {
  return metaGetAll<RemoteAdAccount>("me/adaccounts", token, { fields: "id,name,currency,timezone_name,account_status", limit: "100" });
}

/** Upserts the ad accounts visible to the token (newly found ones are not selected by default unless they're the only one). */
export async function refreshAdAccounts(storeId: string, token: string) {
  const remote = await listRemoteAdAccounts(token);
  const existingCount = await db.metaAdAccount.count({ where: { storeId } });
  for (const a of remote) {
    await db.metaAdAccount.upsert({
      where: { storeId_externalId: { storeId, externalId: a.id } },
      create: {
        storeId, externalId: a.id, name: a.name, currency: a.currency, timezone: a.timezone_name ?? null,
        accountStatus: a.account_status ?? null, isSelected: existingCount === 0 && remote.length === 1,
      },
      update: { name: a.name, currency: a.currency, timezone: a.timezone_name ?? null, accountStatus: a.account_status ?? null },
    });
  }
  return remote.length;
}

async function syncStructure(account: MetaAdAccount, token: string): Promise<number> {
  type C = { id: string; name: string; status?: string; effective_status?: string; objective?: string; start_time?: string; stop_time?: string };
  type S = { id: string; name: string; campaign_id: string; status?: string; effective_status?: string };
  type A = { id: string; name: string; adset_id: string; status?: string; effective_status?: string };
  const [campaigns, adsets, ads] = await Promise.all([
    metaGetAll<C>(`${account.externalId}/campaigns`, token, { fields: "id,name,status,effective_status,objective,start_time,stop_time", limit: "500" }),
    metaGetAll<S>(`${account.externalId}/adsets`, token, { fields: "id,name,campaign_id,status,effective_status", limit: "500" }),
    metaGetAll<A>(`${account.externalId}/ads`, token, { fields: "id,name,adset_id,status,effective_status", limit: "500" }),
  ]);
  const campaignIdMap = new Map<string, string>();
  for (const c of campaigns) {
    const data = {
      name: c.name, status: c.status ?? null, effectiveStatus: c.effective_status ?? null, objective: c.objective ?? null,
      startTime: c.start_time ? new Date(c.start_time) : null, stopTime: c.stop_time ? new Date(c.stop_time) : null,
    };
    const row = await db.metaCampaign.upsert({
      where: { adAccountId_externalId: { adAccountId: account.id, externalId: c.id } },
      create: { adAccountId: account.id, externalId: c.id, ...data },
      update: data,
      select: { id: true },
    });
    campaignIdMap.set(c.id, row.id);
  }
  const adSetIdMap = new Map<string, string>();
  for (const s of adsets) {
    const campaignId = campaignIdMap.get(s.campaign_id);
    if (!campaignId) continue;
    const data = { campaignId, name: s.name, status: s.status ?? null, effectiveStatus: s.effective_status ?? null };
    const row = await db.metaAdSet.upsert({
      where: { adAccountId_externalId: { adAccountId: account.id, externalId: s.id } },
      create: { adAccountId: account.id, externalId: s.id, ...data },
      update: data,
      select: { id: true },
    });
    adSetIdMap.set(s.id, row.id);
  }
  for (const a of ads) {
    const adSetId = adSetIdMap.get(a.adset_id);
    if (!adSetId) continue;
    const data = { adSetId, name: a.name, status: a.status ?? null, effectiveStatus: a.effective_status ?? null };
    await db.metaAd.upsert({
      where: { adAccountId_externalId: { adAccountId: account.id, externalId: a.id } },
      create: { adAccountId: account.id, externalId: a.id, ...data },
      update: data,
    });
  }
  return campaigns.length + adsets.length + ads.length;
}

const dec = (n: number | null) => (n === null ? null : new Prisma.Decimal(n.toFixed(4)));

/**
 * Fetches insights for one level and window and REPLACES the stored rows for
 * that (account, level, window). Meta omits rows without delivery, so
 * replace-in-window is what keeps restated/zeroed days correct and makes
 * re-syncs idempotent (no duplicate insights, no double-counted spend).
 */
export async function syncInsightsWindow(
  account: MetaAdAccount,
  token: string,
  level: (typeof LEVELS)[number],
  since: string,
  until: string,
): Promise<number> {
  const raw = await metaGetAll<RawInsight>(`${account.externalId}/insights`, token, {
    level: level.api,
    fields: INSIGHT_FIELDS,
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    use_unified_attribution_setting: "true",
    limit: "500",
  });
  const rows = raw.map((r) => normalizeInsight(r, level.level, account.externalId));
  await db.$transaction(async (tx) => {
    await tx.metaDailyInsight.deleteMany({
      where: { adAccountId: account.id, level: level.level as InsightLevel, date: { gte: toDbDate(since), lte: toDbDate(until) } },
    });
    if (rows.length) {
      await tx.metaDailyInsight.createMany({
        data: rows.map((r) => ({
          adAccountId: account.id,
          level: r.level as InsightLevel,
          entityExternalId: r.entityExternalId,
          campaignExternalId: r.campaignExternalId,
          adSetExternalId: r.adSetExternalId,
          adExternalId: r.adExternalId,
          date: toDbDate(r.date),
          currency: account.currency,
          spend: dec(r.spend)!,
          impressions: r.impressions,
          reach: r.reach,
          frequency: dec(r.frequency),
          clicks: r.clicks,
          linkClicks: r.linkClicks,
          ctr: dec(r.ctr),
          cpc: dec(r.cpc),
          cpm: dec(r.cpm),
          purchases: dec(r.purchases),
          purchaseValue: dec(r.purchaseValue),
          costPerPurchase: dec(r.costPerPurchase),
          purchaseActionType: r.purchaseActionType,
        })),
        skipDuplicates: false,
      });
    }
  }, { timeout: 60_000 });
  return rows.length;
}

export type MetaSyncMode = "recent" | "daily" | "history";

export interface MetaSyncResult {
  ok: boolean;
  rows: number;
  affectedRange: { from: string; to: string } | null;
  error?: string;
}

/**
 * - recent : today + previous 2 days (account timezone), every ~15 minutes.
 * - daily  : the last 28 days (Meta restates attribution), plus structure.
 * - history: backfills older data in chunks, newest first, within a time budget.
 * Every mode extends the contiguous coverage window [insightsFrom, insightsThrough].
 */
export async function syncMeta(storeId: string, mode: MetaSyncMode, opts: { trigger: string; timeBudgetMs?: number }): Promise<MetaSyncResult> {
  const budget = opts.timeBudgetMs ?? 240_000;
  const started = Date.now();
  const conn = await db.metaConnection.findUnique({ where: { storeId } });
  if (!conn || conn.status === "DISCONNECTED") return { ok: false, rows: 0, affectedRange: null, error: "Meta not connected" };
  if (!(await acquireLock("meta", storeId, budget + 60_000))) return { ok: true, rows: 0, affectedRange: null, error: "Another Meta sync is already running" };

  const log = await startSyncLog(storeId, "META", `insights_${mode}`, opts.trigger);
  let rows = 0;
  let minAffected: string | null = null;
  let maxAffected: string | null = null;
  const touch = (a: string, b: string) => {
    minAffected = !minAffected || a < minAffected ? a : minAffected;
    maxAffected = !maxAffected || b > maxAffected ? b : maxAffected;
  };
  const errors: string[] = [];
  try {
    const token = decryptSecret(conn.accessTokenEnc);
    if (mode !== "recent") await refreshAdAccounts(storeId, token);
    const accounts = await db.metaAdAccount.findMany({ where: { storeId, isSelected: true } });
    if (accounts.length === 0) log.detail("note", "No Meta ad account selected");

    for (const account of accounts) {
      try {
        const tz = account.timezone && isValidTimeZone(account.timezone) ? account.timezone : "UTC";
        const today = todayIn(tz);
        if (mode !== "recent" || !account.insightsThrough) rows += await syncStructure(account, token);

        let windows: { since: string; until: string }[] = [];
        if (!account.insightsThrough || !account.insightsFrom) {
          windows = [{ since: addDays(today, -META_RESTATEMENT_DAYS), until: today }];
        } else if (mode === "recent") {
          windows = [{ since: minDate(addDays(today, -2), addDays(account.insightsThrough.toISOString().slice(0, 10), 1)), until: today }];
        } else if (mode === "daily") {
          windows = [{ since: minDate(addDays(today, -META_RESTATEMENT_DAYS), account.insightsThrough.toISOString().slice(0, 10)), until: today }];
        } else {
          const historyStart = addDays(today, -env.initialHistoryDays);
          const from = account.insightsFrom.toISOString().slice(0, 10);
          if (from > historyStart) {
            // newest-first chunks
            for (let until = addDays(from, -1); until >= historyStart; until = addDays(until, -90)) {
              windows.push({ since: addDays(until, -89) < historyStart ? historyStart : addDays(until, -89), until });
            }
          }
        }

        for (const w of windows) {
          if (Date.now() - started > budget) throw new Error("time_budget");
          for (const lvl of LEVELS) {
            for (const sub of dateWindows(w.since, w.until, lvl.window)) {
              rows += await syncInsightsWindow(account, token, lvl, sub.since, sub.until);
            }
          }
          touch(w.since, w.until);
          // Extend contiguous coverage.
          const from = account.insightsFrom?.toISOString().slice(0, 10);
          const through = account.insightsThrough?.toISOString().slice(0, 10);
          const newFrom = !from || w.since < from ? w.since : from;
          const newThrough = !through || w.until > through ? w.until : through;
          // Only extend if the window is contiguous with existing coverage.
          const contiguous = !from || !through || (w.since <= addDays(through, 1) && w.until >= addDays(from, -1));
          if (contiguous) {
            await db.metaAdAccount.update({
              where: { id: account.id },
              data: { insightsFrom: toDbDate(newFrom), insightsThrough: toDbDate(newThrough), lastInsightsSyncAt: new Date() },
            });
            account.insightsFrom = toDbDate(newFrom);
            account.insightsThrough = toDbDate(newThrough);
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message === "time_budget") {
          errors.push(`${account.name}: time budget reached, will continue next run`);
          break;
        }
        if (e instanceof ApiError && e.kind === "auth") throw e;
        // Partial failure: keep going with other accounts.
        errors.push(`${account.name}: ${errorMessage(e)}`);
      }
    }

    log.add(rows);
    const partial = errors.length > 0;
    await db.metaConnection.update({
      where: { id: conn.id },
      data: {
        lastSyncAt: new Date(),
        ...(partial ? { lastError: errors.join("\n").slice(0, 1000) } : { lastSuccessfulSyncAt: new Date(), lastError: null, status: "ACTIVE" }),
      },
    });
    await log.finish(partial ? "PARTIAL" : "COMPLETED", partial ? errors.join("\n").slice(0, 2000) : null);
    const range = minAffected && maxAffected ? { from: minAffected as string, to: maxAffected as string } : null;
    return { ok: !partial, rows, affectedRange: range, error: partial ? errors.join("; ") : undefined };
  } catch (e) {
    const msg = errorMessage(e);
    await db.metaConnection.update({
      where: { id: conn.id },
      data: { lastSyncAt: new Date(), lastError: msg.slice(0, 1000), status: e instanceof ApiError && e.kind === "auth" ? "EXPIRED" : "ERROR" },
    });
    await log.fail(e);
    const range = minAffected && maxAffected ? { from: minAffected as string, to: maxAffected as string } : null;
    return { ok: false, rows, affectedRange: range, error: msg };
  } finally {
    await releaseLock("meta", storeId);
  }
}
