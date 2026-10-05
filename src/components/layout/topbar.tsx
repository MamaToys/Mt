import { Suspense } from "react";
import type { Freshness } from "@/lib/reports/queries";
import { UrlDateControls } from "./date-controls";
import { FreshnessBar } from "./freshness";
import { RefreshButton } from "./refresh-button";
import { UserMenu } from "./user-menu";

export function TopBar(props: { storeName: string; isDemo: boolean; timezone: string; currency: string; weekStartsOn: number; email: string; freshness: Freshness }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      {props.isDemo && (
        <div className="bg-warning-bg px-4 py-1 text-center text-xs font-medium text-warning" role="note">
          DEMO DATA — this store contains generated sample data for development. These are not real sales or ad spend figures.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 pl-14 lg:pl-4">
        <div className="mr-2 min-w-0">
          <div className="truncate text-sm font-semibold">{props.storeName}</div>
          <div className="text-[11px] text-subtle">{props.currency} · {props.timezone}</div>
        </div>
        <Suspense>
          <UrlDateControls timezone={props.timezone} weekStartsOn={props.weekStartsOn} />
        </Suspense>
        <div className="ml-auto flex items-center gap-3">
          <RefreshButton />
          <UserMenu email={props.email} />
        </div>
      </div>
      <div className="px-4 pb-2 lg:pl-4 pl-14">
        <FreshnessBar f={props.freshness} timezone={props.timezone} />
      </div>
    </header>
  );
}
