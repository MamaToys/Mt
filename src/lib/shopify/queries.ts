// Validated against the Shopify Admin GraphQL schema. Amounts always use
// shopMoney (shop currency) — presentment currency is never used for reporting.

const MONEY = "shopMoney { amount currencyCode }";

export const ORDER_FIELDS = `
  id
  name
  number
  createdAt
  updatedAt
  processedAt
  cancelledAt
  cancelReason
  closedAt
  test
  sourceName
  displayFinancialStatus
  displayFulfillmentStatus
  currencyCode
  subtotalPriceSet { ${MONEY} }
  totalPriceSet { ${MONEY} }
  totalDiscountsSet { ${MONEY} }
  totalTaxSet { ${MONEY} }
  totalShippingPriceSet { ${MONEY} }
  totalRefundedSet { ${MONEY} }
  netPaymentSet { ${MONEY} }
  currentTotalPriceSet { ${MONEY} }
  customerJourneySummary {
    lastVisit {
      landingPage
      utmParameters { source medium campaign term content }
    }
  }
`;

const LINE_FIELDS = `
  id
  title
  variantTitle
  sku
  quantity
  isGiftCard
  product { id }
  variant { id inventoryItem { unitCost { amount } } }
  originalUnitPriceSet { ${MONEY} }
  discountAllocations { allocatedAmountSet { ${MONEY} } }
`;

/** Full detail of one order. Requested cost stays well under the 1,000 point limit. */
export const ORDER_DETAIL_QUERY = `
query OrderDetail($id: ID!) {
  order(id: $id) {
    ${ORDER_FIELDS}
    lineItems(first: 50) {
      pageInfo { hasNextPage endCursor }
      nodes { ${LINE_FIELDS} }
    }
    refunds(first: 10) {
      id
      createdAt
      note
      totalRefundedSet { ${MONEY} }
      refundShippingLines(first: 5) { nodes { subtotalAmountSet { ${MONEY} } } }
      refundLineItems(first: 20) {
        pageInfo { hasNextPage }
        nodes {
          id
          quantity
          restockType
          lineItem { id }
          subtotalSet { ${MONEY} }
          totalTaxSet { ${MONEY} }
        }
      }
    }
  }
}`;

/** Extra line items for orders with more than 50 lines. */
export const ORDER_LINES_PAGE_QUERY = `
query OrderLines($id: ID!, $after: String) {
  order(id: $id) {
    lineItems(first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { ${LINE_FIELDS} }
    }
  }
}`;

/** Cheap listing of order IDs changed since a timestamp, oldest first. */
export const ORDER_IDS_QUERY = `
query OrderIds($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes { id updatedAt }
  }
}`;

export const SHOP_QUERY = `query Shop { shop { name currencyCode ianaTimezone myshopifyDomain } }`;

export const VARIANTS_QUERY = `
query Variants($first: Int!, $after: String) {
  productVariants(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id sku title price product { id title status } inventoryItem { unitCost { amount } } }
  }
}`;

export const WEBHOOK_CREATE_MUTATION = `
mutation Sub($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
    webhookSubscription { id }
    userErrors { field message }
  }
}`;
