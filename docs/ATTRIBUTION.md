# Attribution methodology

The app keeps two views of revenue strictly separate:

| | Source | Used for |
|---|---|---|
| **Platform attribution** | Meta's purchase conversions (pixel/CAPI, Meta's attribution window, includes view-through) | Meta ROAS, Meta CPA, Meta revenue |
| **Actual store revenue** | Shopify orders and refunds | Net sales, Shopify ROAS, profit |

Store-level Shopify ROAS needs no attribution: it is all net sales ÷ all Meta spend.

## Campaign-level Shopify revenue: last-visit UTM match

Shopify does not know which Meta campaign produced an order. The app only assigns an
order to a campaign when Shopify's `customerJourneySummary.lastVisit.utmParameters`
match a Meta entity (`src/lib/shopify/attribution.ts`):

1. `utm_campaign` equals a Meta **campaign ID** → that campaign; otherwise, if
   `utm_source` is a Meta source (facebook, fb, instagram, ig, meta, an, messenger,
   threads) and `utm_campaign` equals a campaign **name** exactly (case-insensitive,
   names shared by several campaigns are ignored) → that campaign.
2. `utm_term` equal to an ad set ID → ad set; `utm_content` equal to an ad ID → ad.
3. Anything else is **unattributed**. Nothing is inferred or distributed.

Recommended URL parameters in Ads Manager (ad level → Tracking → URL parameters):

```
utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}
```

If no order in the store matches any campaign, the campaign table shows
**"Shopify campaign attribution unavailable"** instead of zeros.

Limitations (shown in the UI): last-visit UTMs miss view-through, cross-device and
untagged visits, so UTM-attributed revenue is usually *lower* than Meta-attributed
revenue; neither is "the truth" for a single campaign.

## Campaign profit

`attributed net sales − attributed product cost − campaign spend − modelled shipping & payment fees`.
Fixed overheads and other expenses are not allocated to campaigns.

## Products

Meta spend is **not** allocated to products. Product profit is gross profit
(net sales − product cost), and the "Ad spend allocation" column says "Unavailable".
