import { describe, expect, it } from "vitest";
import { GqlOrder, normalizeOrder } from "@/lib/shopify/normalize";
import { attributeOrder, buildLookup } from "@/lib/shopify/attribution";
import { extractPurchases, normalizeInsight, dateWindows } from "@/lib/meta/normalize";
import { toCsv } from "@/lib/reports/csv";

const m = (a: number | string, c = "USD") => ({ shopMoney: { amount: String(a), currencyCode: c } });

export function gqlOrder(p: Partial<GqlOrder> = {}): GqlOrder {
  return {
    id: "gid://shopify/Order/1001", name: "#1001", number: 1001,
    createdAt: "2026-10-04T21:30:00Z", updatedAt: "2026-10-04T21:30:00Z", processedAt: "2026-10-04T21:30:00Z",
    cancelledAt: null, cancelReason: null, closedAt: null, test: false, sourceName: "web",
    displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED", currencyCode: "USD",
    subtotalPriceSet: m(180), totalPriceSet: m(199), totalDiscountsSet: m(20), totalTaxSet: m(9), totalShippingPriceSet: m(10),
    totalRefundedSet: m(0), netPaymentSet: m(199), currentTotalPriceSet: m(199),
    customerJourneySummary: { lastVisit: { landingPage: "/", utmParameters: { source: "facebook", medium: "paid", campaign: "111", term: "222", content: "333" } } },
    lineItems: {
      nodes: [
        { id: "gid://shopify/LineItem/1", title: "Toy", variantTitle: null, sku: "T-1", quantity: 2, isGiftCard: false, product: { id: "gid://shopify/Product/9" }, variant: { id: "gid://shopify/ProductVariant/99", inventoryItem: { unitCost: { amount: "30.00" } } }, originalUnitPriceSet: m(100), discountAllocations: [{ allocatedAmountSet: m(20) }] },
        { id: "gid://shopify/LineItem/2", title: "Gift card", variantTitle: null, sku: null, quantity: 1, isGiftCard: true, product: null, variant: null, originalUnitPriceSet: m(50), discountAllocations: [] },
      ],
    },
    refunds: [],
    ...p,
  };
}

describe("Shopify order normalization", () => {
  it("uses shop money, store-timezone dates, excludes gift cards from gross sales", () => {
    const n = normalizeOrder(gqlOrder(), "Asia/Muscat");
    expect(n.externalId).toBe("1001");
    expect(n.localDate).toBe("2026-10-05"); // 21:30Z = 01:30 next day in Muscat
    expect(n.localHour).toBe(1);
    expect(n.grossSales).toBe(200);
    expect(n.lines[0].totalDiscount).toBe(20);
    expect(n.lines[0].shopifyUnitCost).toBe(30);
    expect(n.lines[0].variantExternalId).toBe("99");
    expect(n.utmCampaign).toBe("111");
    expect(normalizeOrder(gqlOrder(), "America/New_York").localDate).toBe("2026-10-04");
  });
  it("normalizes refunds with their own local date", () => {
    const n = normalizeOrder(
      gqlOrder({
        refunds: [{
          id: "gid://shopify/Refund/5", createdAt: "2026-10-06T10:00:00Z", note: null, totalRefundedSet: m(110),
          refundShippingLines: { nodes: [{ subtotalAmountSet: m(5) }] },
          refundLineItems: { nodes: [{ id: "gid://shopify/RefundLineItem/7", quantity: 1, restockType: "RETURN", lineItem: { id: "gid://shopify/LineItem/1" }, subtotalSet: m(90), totalTaxSet: m(4.5) }] },
        }],
      }),
      "Asia/Muscat",
    );
    expect(n.refunds[0]).toMatchObject({ externalId: "5", localDate: "2026-10-06", totalRefunded: 110, lineItemsSubtotal: 90, lineItemsTax: 4.5, shippingRefunded: 5 });
  });
});

describe("UTM attribution", () => {
  const lookup = buildLookup([{ externalId: "111", name: "Prospecting" }, { externalId: "112", name: "Dup" }, { externalId: "113", name: "dup" }], ["222"], ["333"]);
  it("matches by campaign ID, ad set and ad IDs", () => {
    expect(attributeOrder({ utmSource: "facebook", utmCampaign: "111", utmTerm: "222", utmContent: "333" }, lookup)).toEqual({ campaignId: "111", adSetId: "222", adId: "333" });
  });
  it("matches by exact name only for Meta sources", () => {
    expect(attributeOrder({ utmSource: "ig", utmCampaign: "prospecting", utmTerm: null, utmContent: null }, lookup).campaignId).toBe("111");
    expect(attributeOrder({ utmSource: "google", utmCampaign: "prospecting", utmTerm: null, utmContent: null }, lookup).campaignId).toBeNull();
  });
  it("never matches ambiguous names or unknown values", () => {
    expect(attributeOrder({ utmSource: "facebook", utmCampaign: "dup", utmTerm: null, utmContent: null }, lookup).campaignId).toBeNull();
    expect(attributeOrder({ utmSource: "facebook", utmCampaign: "999", utmTerm: null, utmContent: null }, lookup).campaignId).toBeNull();
    expect(attributeOrder({ utmSource: null, utmCampaign: null, utmTerm: null, utmContent: null }, lookup).campaignId).toBeNull();
  });
});

describe("Meta insight normalization", () => {
  it("uses exactly one purchase action type (no double counting of aliases)", () => {
    const r = extractPurchases(
      [{ action_type: "purchase", value: "5" }, { action_type: "omni_purchase", value: "6" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "5" }],
      [{ action_type: "purchase", value: "500" }, { action_type: "omni_purchase", value: "610" }],
    );
    expect(r).toEqual({ purchases: 6, purchaseValue: 610, actionType: "omni_purchase" });
    expect(extractPurchases(undefined, undefined)).toEqual({ purchases: 0, purchaseValue: 0, actionType: null });
  });
  it("normalizes a campaign row", () => {
    const n = normalizeInsight({ date_start: "2026-10-01", date_stop: "2026-10-01", campaign_id: "111", spend: "120.50", impressions: "10000", clicks: "200", inline_link_clicks: "150", actions: [{ action_type: "purchase", value: "4" }], action_values: [{ action_type: "purchase", value: "400" }] }, "CAMPAIGN", "act_1");
    expect(n).toMatchObject({ entityExternalId: "111", spend: 120.5, purchases: 4, purchaseValue: 400, costPerPurchase: 30.125, date: "2026-10-01" });
    expect(n.impressions).toBe(BigInt(10000));
  });
  it("splits date windows", () => {
    expect(dateWindows("2026-01-01", "2026-01-10", 4)).toEqual([
      { since: "2026-01-01", until: "2026-01-04" }, { since: "2026-01-05", until: "2026-01-08" }, { since: "2026-01-09", until: "2026-01-10" },
    ]);
  });
});

describe("CSV export", () => {
  it("escapes, blanks nulls (never 0) and neutralises formulas", () => {
    expect(toCsv(["a", "b", "c"], [["x,y", null, "=HYPERLINK()"], [1.23456789, 0, 'say "hi"']])).toBe(
      'a,b,c\r\n"x,y",,\'=HYPERLINK()\r\n1.2346,0,"say ""hi"""\r\n',
    );
  });
});
