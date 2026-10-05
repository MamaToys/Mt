import { requireStore } from "@/lib/session";
import { db } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/dash/notices";
import { RefreshButton } from "@/components/layout/refresh-button";

export const dynamic = "force-dynamic";

const VARIANT = { COMPLETED: "good", PARTIAL: "warning", FAILED: "critical", RUNNING: "info" } as const;

export default async function SyncLogsPage() {
  const { store } = await requireStore();
  const logs = await db.syncLog.findMany({ where: { storeId: store.id }, orderBy: { startedAt: "desc" }, take: 200 });
  const webhooks = await db.webhookEvent.findMany({ where: { storeId: store.id }, orderBy: { receivedAt: "desc" }, take: 20 });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Sync Logs" description="Every Shopify/Meta import and metric recalculation, newest first.">
        <RefreshButton />
      </PageHeader>
      <Card className="p-2">
        <Table>
          <THead>
            <TR><TH>Platform</TH><TH>Sync type</TH><TH>Trigger</TH><TH>Started</TH><TH>Completed</TH><TH className="text-right">Records</TH><TH>Status</TH><TH>Error</TH></TR>
          </THead>
          <TBody>
            {logs.length === 0 && <TR><TD colSpan={8} className="py-6 text-center text-muted-foreground">No syncs yet.</TD></TR>}
            {logs.map((l) => (
              <TR key={l.id}>
                <TD className="font-medium">{l.platform === "SYSTEM" ? "System" : l.platform === "META" ? "Meta" : "Shopify"}</TD>
                <TD>{l.syncType.replace(/_/g, " ")}</TD>
                <TD className="text-xs text-muted-foreground">{l.trigger}</TD>
                <TD>{formatDateTime(l.startedAt, store.timezone)}</TD>
                <TD>{l.completedAt ? formatDateTime(l.completedAt, store.timezone) : "—"}</TD>
                <TD className="text-right">{formatNumber(l.recordsImported)}</TD>
                <TD><Badge variant={VARIANT[l.status]}>{l.status.toLowerCase()}</Badge></TD>
                <TD className="max-w-96 whitespace-normal text-xs text-critical">{l.errorMessage}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      {webhooks.length > 0 && (
        <Card className="p-2">
          <h2 className="p-2 text-sm font-semibold">Recent Shopify webhooks</h2>
          <Table>
            <THead><TR><TH>Topic</TH><TH>Order</TH><TH>Received</TH><TH>Processed</TH><TH>Error</TH></TR></THead>
            <TBody>
              {webhooks.map((w) => (
                <TR key={w.id}>
                  <TD>{w.topic}</TD><TD>{w.resourceId}</TD><TD>{formatDateTime(w.receivedAt, store.timezone)}</TD>
                  <TD>{w.processedAt ? formatDateTime(w.processedAt, store.timezone) : "—"}</TD><TD className="text-xs text-critical">{w.error}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
