import "server-only";
import { db } from "../db";

/**
 * Re-derives every stored store-local date/hour from the exact UTC timestamps
 * when the store timezone changes, so all days use the new timezone consistently.
 */
export async function rebucketTimezone(storeId: string, timezone: string) {
  await db.$transaction([
    db.$executeRaw`UPDATE "ShopifyOrder" SET "localDate" = (("processedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date,
      "localHour" = EXTRACT(HOUR FROM (("processedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}))::int WHERE "storeId" = ${storeId}`,
    db.$executeRaw`UPDATE "ShopifyRefund" r SET "localDate" = ((r."processedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date
      FROM "ShopifyOrder" o WHERE r."orderId" = o.id AND o."storeId" = ${storeId}`,
  ]);
}
