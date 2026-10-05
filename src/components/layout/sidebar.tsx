"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Bell, BookOpen, Clock, History, LayoutDashboard, Megaphone, Package, PiggyBank, Plug, Receipt, Settings, ShoppingBag, Sparkles, Target, Menu, X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

const ICONS = { Bell, BookOpen, Clock, History, LayoutDashboard, Megaphone, Package, PiggyBank, Plug, Receipt, Settings, ShoppingBag, Sparkles, Target };
// Date range / comparison carry over between report pages.
const KEEP = ["range", "from", "to", "compare"];

export function Sidebar({ alertCount }: { alertCount: number }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const qs = new URLSearchParams();
  for (const k of KEEP) {
    const v = sp.get(k);
    if (v) qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs}` : "";

  const links = (
    <nav className="flex flex-col gap-0.5 p-2" aria-label="Main">
      {NAV.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={`${item.href}${suffix}`}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              active && "bg-muted font-medium text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="flex-1">{item.label}</span>
            {item.href === "/alerts" && alertCount > 0 && (
              <span className="rounded-full bg-critical-bg px-1.5 text-xs text-critical">{alertCount}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <button
        className="fixed left-3 top-3 z-40 rounded-md border border-border bg-card p-2 lg:hidden"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close navigation" : "Open navigation"}
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-56 border-r border-border bg-surface pt-14 transition-transform lg:translate-x-0 lg:pt-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="hidden h-14 items-center gap-2 border-b border-border px-4 lg:flex">
          <PiggyBank className="size-5 text-primary" />
          <span className="text-sm font-semibold">Profit Dashboard</span>
        </div>
        {links}
      </aside>
    </>
  );
}
