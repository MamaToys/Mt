import "server-only";
import { Platform, Prisma, SyncStatus } from "@prisma/client";
import { db } from "../db";
import { errorMessage } from "../http";

export interface SyncLogHandle {
  id: string;
  add(n: number): void;
  detail(key: string, value: unknown): void;
  finish(status?: SyncStatus, error?: string | null): Promise<void>;
  fail(e: unknown): Promise<void>;
}

/** Creates a SyncLog row and returns a handle to complete it. */
export async function startSyncLog(storeId: string, platform: Platform, syncType: string, trigger: string): Promise<SyncLogHandle> {
  const row = await db.syncLog.create({ data: { storeId, platform, syncType, trigger } });
  let records = 0;
  const details: Record<string, unknown> = {};
  const handle: SyncLogHandle = {
    id: row.id,
    add(n) {
      records += n;
    },
    detail(k, v) {
      details[k] = v;
    },
    async finish(status = "COMPLETED", error = null) {
      await db.syncLog.update({
        where: { id: row.id },
        data: {
          status,
          completedAt: new Date(),
          recordsImported: records,
          errorMessage: error,
          details: details as Prisma.InputJsonValue,
        },
      });
    },
    async fail(e) {
      await handle.finish("FAILED", errorMessage(e).slice(0, 2000));
    },
  };
  return handle;
}
