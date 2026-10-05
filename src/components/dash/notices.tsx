import Link from "next/link";
import { AlertTriangle, Info, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function SetupState({ shopify, meta }: { shopify: boolean; meta: boolean }) {
  if (shopify && meta) return null;
  return (
    <Card className="flex flex-col gap-3 border-dashed p-5 md:flex-row md:items-center">
      <Plug className="size-6 text-primary" />
      <div className="flex-1 text-sm">
        {!shopify && <p className="font-medium">Connect Shopify to begin importing sales.</p>}
        {!meta && <p className="font-medium">Connect Meta Ads to begin importing advertising data.</p>}
        <p className="text-muted-foreground">Until a source is connected its figures are shown as N/A — never as zero.</p>
      </div>
      <Button asChild><Link href="/integrations">Go to Integrations</Link></Button>
    </Card>
  );
}

export function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-info-bg p-3 text-xs">
      {notes.map((n) => (
        <p key={n} className="flex items-start gap-2"><Info className="mt-0.5 size-3.5 shrink-0 text-primary" />{n}</p>
      ))}
    </div>
  );
}

export function Gaps({ gaps }: { gaps: string[] }) {
  if (!gaps.length) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-warning-bg p-3 text-xs text-warning" role="note">
      {gaps.map((g) => (
        <p key={g} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{g}</p>
      ))}
    </div>
  );
}

export function SectionTitle({ title, children, updated }: { title: string; children?: React.ReactNode; updated?: string | null }) {
  return (
    <div className="mb-2 mt-6 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {updated && <p className="text-[11px] text-subtle">{updated}</p>}
      </div>
      {children}
    </div>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}
