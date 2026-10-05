import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/session";
import { loadFreshness } from "@/lib/reports/queries";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, store } = await requireStore();
  const [freshness, alertCount] = await Promise.all([
    loadFreshness(store.id),
    db.alert.count({ where: { storeId: store.id, dismissedAt: null, severity: { in: ["WARNING", "CRITICAL"] } } }),
  ]);
  return (
    <div className="min-h-screen">
      <Suspense>
        <Sidebar alertCount={alertCount} />
      </Suspense>
      <div className="lg:pl-56">
        <TopBar
          storeName={store.name}
          isDemo={store.isDemo}
          timezone={store.timezone}
          currency={store.currency}
          weekStartsOn={store.weekStartsOn}
          email={user.email}
          freshness={freshness}
        />
        <main className="mx-auto max-w-[1600px] p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
