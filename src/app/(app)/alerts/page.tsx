import { requireStore } from "@/lib/session";
import { db } from "@/lib/db";
import { AlertsList } from "@/components/dash/alerts-list";
import { PageHeader } from "@/components/dash/notices";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const { store } = await requireStore();
  const [open, dismissed] = await Promise.all([
    db.alert.findMany({ where: { storeId: store.id, dismissedAt: null }, orderBy: [{ date: "desc" }, { severity: "desc" }], take: 200 }),
    db.alert.findMany({ where: { storeId: store.id, dismissedAt: { not: null } }, orderBy: { date: "desc" }, take: 50 }),
  ]);
  const map = (a: (typeof open)[number]) => ({ id: a.id, severity: a.severity, title: a.title, message: a.message, date: a.date.toISOString().slice(0, 10) });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Alerts" description="Warnings and opportunities evaluated after every sync on the last complete day and the last 7 days. Thresholds are set in Settings." />
      <AlertsList alerts={open.map(map)} />
      {dismissed.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Recently dismissed</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {dismissed.map((a) => <li key={a.id}>{a.date.toISOString().slice(0, 10)} · {a.title} — {a.message}</li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}
