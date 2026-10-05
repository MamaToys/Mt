import "server-only";
import { db } from "../db";

/**
 * Lease-based lock stored on the connection row, so overlapping cron runs,
 * webhooks and "Sync now" clicks never run the same sync concurrently.
 * The lease expires automatically if a serverless function dies mid-run.
 */
export async function acquireLock(kind: "shopify" | "meta", storeId: string, leaseMs: number): Promise<boolean> {
  const now = new Date();
  const until = new Date(now.getTime() + leaseMs);
  const where = { storeId, OR: [{ syncLockedUntil: null }, { syncLockedUntil: { lt: now } }] };
  const res =
    kind === "shopify"
      ? await db.shopifyConnection.updateMany({ where, data: { syncLockedUntil: until } })
      : await db.metaConnection.updateMany({ where, data: { syncLockedUntil: until } });
  return res.count === 1;
}

export async function releaseLock(kind: "shopify" | "meta", storeId: string): Promise<void> {
  if (kind === "shopify") await db.shopifyConnection.updateMany({ where: { storeId }, data: { syncLockedUntil: null } });
  else await db.metaConnection.updateMany({ where: { storeId }, data: { syncLockedUntil: null } });
}
