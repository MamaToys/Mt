/**
 * UTM attribution of Shopify orders to Meta campaigns — the ONLY method used
 * to produce campaign-level Shopify revenue. See docs/ATTRIBUTION.md.
 *
 * Methodology ("last-visit UTM match"):
 * 1. Take the UTM parameters of the customer's last visit before purchase
 *    (Shopify customerJourneySummary.lastVisit).
 * 2. utm_campaign is matched to a Meta campaign by ID (recommended URL
 *    parameter: utm_campaign={{campaign.id}}), or — only when utm_source is a
 *    Meta source — by exact (case-insensitive) campaign name.
 * 3. utm_term / utm_content are matched to ad set / ad IDs when they are
 *    Meta IDs ({{adset.id}} / {{ad.id}}).
 * Orders without a match are NOT assigned to any campaign. Nothing is inferred.
 */

export const META_SOURCES = new Set(["facebook", "fb", "instagram", "ig", "meta", "an", "msg", "messenger", "threads"]);

export interface AttributionLookup {
  campaignIds: Set<string>;
  campaignIdByName: Map<string, string>; // lower-cased name → id (only unique names)
  adSetIds: Set<string>;
  adIds: Set<string>;
}

export interface Attribution {
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
}

const NONE: Attribution = { campaignId: null, adSetId: null, adId: null };

export function buildLookup(
  campaigns: { externalId: string; name: string }[],
  adSetIds: string[] = [],
  adIds: string[] = [],
): AttributionLookup {
  const byName = new Map<string, string>();
  const dupes = new Set<string>();
  for (const c of campaigns) {
    const k = c.name.trim().toLowerCase();
    if (byName.has(k) && byName.get(k) !== c.externalId) dupes.add(k);
    byName.set(k, c.externalId);
  }
  for (const d of dupes) byName.delete(d); // ambiguous names are never matched
  return { campaignIds: new Set(campaigns.map((c) => c.externalId)), campaignIdByName: byName, adSetIds: new Set(adSetIds), adIds: new Set(adIds) };
}

export function attributeOrder(
  utm: { utmSource: string | null; utmCampaign: string | null; utmTerm: string | null; utmContent: string | null },
  lookup: AttributionLookup,
): Attribution {
  const campaign = utm.utmCampaign?.trim();
  if (!campaign) return NONE;
  const isMetaSource = utm.utmSource ? META_SOURCES.has(utm.utmSource.trim().toLowerCase()) : false;

  let campaignId: string | null = null;
  if (lookup.campaignIds.has(campaign)) campaignId = campaign;
  else if (isMetaSource) campaignId = lookup.campaignIdByName.get(campaign.toLowerCase()) ?? null;
  if (!campaignId) return NONE;

  const term = utm.utmTerm?.trim() ?? "";
  const content = utm.utmContent?.trim() ?? "";
  return {
    campaignId,
    adSetId: lookup.adSetIds.has(term) ? term : null,
    adId: lookup.adIds.has(content) ? content : null,
  };
}
