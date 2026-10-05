/**
 * Pure conversion of Meta Marketing API insight rows. Meta returns money as
 * decimal strings in the ad account currency, dates in the account timezone.
 */

export interface MetaAction {
  action_type: string;
  value: string;
}

export interface RawInsight {
  date_start: string;
  date_stop: string;
  account_id?: string;
  account_currency?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  inline_link_clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
}

/**
 * Purchase action types in priority order. Exactly ONE is used per row, so
 * purchases reported under several aliases are never added together.
 */
export const PURCHASE_ACTION_PRIORITY = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_web_purchase",
  "onsite_web_app_purchase",
] as const;

export function extractPurchases(actions?: MetaAction[], values?: MetaAction[]): {
  purchases: number | null;
  purchaseValue: number | null;
  actionType: string | null;
} {
  const a = new Map((actions ?? []).map((x) => [x.action_type, Number(x.value)]));
  const v = new Map((values ?? []).map((x) => [x.action_type, Number(x.value)]));
  for (const t of PURCHASE_ACTION_PRIORITY) {
    if (a.has(t) || v.has(t)) return { purchases: a.get(t) ?? 0, purchaseValue: v.get(t) ?? 0, actionType: t };
  }
  return { purchases: 0, purchaseValue: 0, actionType: null };
}

const num = (s?: string) => (s === undefined || s === "" ? null : Number(s));
const int = (s?: string) => (s === undefined || s === "" ? null : BigInt(Math.round(Number(s))));

export type Level = "ACCOUNT" | "CAMPAIGN" | "ADSET" | "AD";

export interface NormalizedInsight {
  level: Level;
  entityExternalId: string;
  campaignExternalId: string | null;
  adSetExternalId: string | null;
  adExternalId: string | null;
  date: string;
  spend: number;
  impressions: bigint;
  reach: bigint | null;
  frequency: number | null;
  clicks: bigint;
  linkClicks: bigint | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  costPerPurchase: number | null;
  purchaseActionType: string | null;
}

export function normalizeInsight(r: RawInsight, level: Level, accountExternalId: string): NormalizedInsight {
  const { purchases, purchaseValue, actionType } = extractPurchases(r.actions, r.action_values);
  const spend = num(r.spend) ?? 0;
  const entity =
    level === "ACCOUNT" ? accountExternalId : level === "CAMPAIGN" ? r.campaign_id : level === "ADSET" ? r.adset_id : r.ad_id;
  if (!entity) throw new Error(`Insight row at level ${level} is missing its entity id`);
  return {
    level,
    entityExternalId: entity,
    campaignExternalId: r.campaign_id ?? null,
    adSetExternalId: r.adset_id ?? null,
    adExternalId: r.ad_id ?? null,
    date: r.date_start,
    spend,
    impressions: int(r.impressions) ?? BigInt(0),
    reach: int(r.reach),
    frequency: num(r.frequency),
    clicks: int(r.clicks) ?? BigInt(0),
    linkClicks: int(r.inline_link_clicks),
    ctr: num(r.ctr),
    cpc: num(r.cpc),
    cpm: num(r.cpm),
    purchases,
    purchaseValue,
    costPerPurchase: purchases ? spend / purchases : null,
    purchaseActionType: actionType,
  };
}

/** Splits [from, to] into consecutive windows of at most `days` days. */
export function dateWindows(from: string, to: string, days: number): { since: string; until: string }[] {
  const out: { since: string; until: string }[] = [];
  let s = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (s <= end) {
    const u = new Date(s);
    u.setUTCDate(u.getUTCDate() + days - 1);
    const until = u > end ? end : u;
    out.push({ since: s.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) });
    s = new Date(until);
    s.setUTCDate(s.getUTCDate() + 1);
  }
  return out;
}
