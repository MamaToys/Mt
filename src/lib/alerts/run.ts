import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { addDays, todayIn, toDbDate } from "../metrics/dates";
import { formatMoney } from "../format";
import { ensureSettings } from "../sync/rollup";
import { loadCampaigns, loadPeriod } from "../reports/queries";
import { evaluateAlerts } from "./engine";

const n = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));

/** Evaluates alert rules on the last complete day / 7 days and upserts them. */
export async function runAlerts(storeId: string): Promise<number> {
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId } });
  const s = await ensureSettings(storeId);
  const yesterday = addDays(todayIn(store.timezone), -1);
  const [day, prevDay, week, prevWeek, campaigns7, campaignsY] = await Promise.all([
    loadPeriod(storeId, { from: yesterday, to: yesterday }),
    loadPeriod(storeId, { from: addDays(yesterday, -1), to: addDays(yesterday, -1) }),
    loadPeriod(storeId, { from: addDays(yesterday, -6), to: yesterday }),
    loadPeriod(storeId, { from: addDays(yesterday, -13), to: addDays(yesterday, -7) }),
    loadCampaigns(storeId, { from: addDays(yesterday, -6), to: yesterday }),
    loadCampaigns(storeId, { from: yesterday, to: yesterday }),
  ]);
  const ySpend = new Map(campaignsY.rows.map((r) => [r.campaignId, r.spend]));
  const drafts = evaluateAlerts({
    date: yesterday,
    day: day.kpis,
    prevDay: prevDay.kpis,
    week: week.kpis,
    prevWeek: prevWeek.kpis,
    attributionAvailable: campaigns7.attributionAvailable,
    campaigns: campaigns7.rows.map((r) => ({
      id: r.campaignId,
      name: r.name,
      spend7d: r.spend,
      purchases7d: r.purchases,
      metaRoas7d: r.metaRoas,
      shopifyRoas7d: r.shopifyRoas,
      spendYesterday: ySpend.get(r.campaignId) ?? 0,
    })),
    thresholds: {
      discrepancyPct: Number(s.alertDiscrepancyPct),
      campaignSpendNoPurchases: Number(s.alertCampaignSpendNoPurch),
      campaignDailySpendMax: n(s.alertCampaignDailySpendMax),
      cpaIncreasePct: Number(s.alertCpaIncreasePct),
      salesDeclinePct: Number(s.alertSalesDeclinePct),
      refundRatePct: Number(s.alertRefundRatePct),
      targetProfitMargin: s.targetProfitMargin === null ? null : Number(s.targetProfitMargin) * 100,
      targetRoas: n(s.targetRoas),
    },
    money: (v) => formatMoney(v, store.currency),
  });
  for (const a of drafts) {
    const data = { severity: a.severity, title: a.title, message: a.message, date: toDbDate(yesterday), data: (a.data ?? {}) as Prisma.InputJsonValue };
    await db.alert.upsert({
      where: { storeId_type_key: { storeId, type: a.type, key: a.key } },
      create: { storeId, type: a.type, key: a.key, ...data },
      update: data,
    });
  }
  return drafts.length;
}
