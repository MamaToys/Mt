import "server-only";
import { db } from "../db";
import type { FilterOptions } from "@/components/dash/filter-bar";

export async function loadFilterOptions(storeId: string): Promise<FilterOptions> {
  const [accounts, campaigns, adsets, ads, products] = await Promise.all([
    db.metaAdAccount.findMany({ where: { storeId, isSelected: true }, select: { externalId: true, name: true }, orderBy: { name: "asc" } }),
    db.metaCampaign.findMany({ where: { adAccount: { storeId, isSelected: true } }, select: { externalId: true, name: true, adAccount: { select: { externalId: true } } }, orderBy: { name: "asc" } }),
    db.metaAdSet.findMany({ where: { adAccount: { storeId, isSelected: true } }, select: { externalId: true, name: true, campaign: { select: { externalId: true } } }, orderBy: { name: "asc" }, take: 2000 }),
    db.metaAd.findMany({ where: { adAccount: { storeId, isSelected: true } }, select: { externalId: true, name: true, adSet: { select: { externalId: true } } }, orderBy: { name: "asc" }, take: 5000 }),
    db.productDailyMetric.findMany({ where: { storeId }, distinct: ["productExternalId"], select: { productExternalId: true, title: true }, orderBy: { productExternalId: "asc" }, take: 2000 }),
  ]);
  return {
    accounts: accounts.map((a) => ({ id: a.externalId, name: a.name })),
    campaigns: campaigns.map((c) => ({ id: c.externalId, name: c.name, accountId: c.adAccount.externalId })),
    adsets: adsets.map((s) => ({ id: s.externalId, name: s.name, campaignId: s.campaign.externalId })),
    ads: ads.map((a) => ({ id: a.externalId, name: a.name, adsetId: a.adSet.externalId })),
    products: products.map((p) => ({ id: p.productExternalId, name: p.title })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}
