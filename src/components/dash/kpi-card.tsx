import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/tooltip";
import { formatChange } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  label: string;
  value: string;
  change?: number | null;
  /** Whether an increase is good (sales) or bad (costs). */
  upIsGood?: boolean;
  definition: string;
  sub?: React.ReactNode;
  warning?: string | null;
  emphasis?: boolean;
  compareLabel?: string | null;
}

export function KpiCard({ label, value, change, upIsGood = true, definition, sub, warning, emphasis, compareLabel }: KpiCardProps) {
  const hasChange = typeof change === "number" && Number.isFinite(change);
  const good = hasChange ? (upIsGood ? change! > 0 : change! < 0) : null;
  const Icon = !hasChange || Math.abs(change!) < 0.05 ? Minus : change! > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className={cn("flex flex-col gap-1 p-4", emphasis && "ring-1 ring-primary/30")}>
      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        <InfoTip>{definition}</InfoTip>
      </div>
      <div className={cn("text-2xl font-semibold leading-tight", value === "N/A" && "text-subtle")}>{value}</div>
      {compareLabel !== null && (
        <div className="flex items-center gap-1 text-xs">
          {hasChange ? (
            <span className={cn("flex items-center gap-0.5 font-medium", good ? "text-good" : "text-critical")}>
              <Icon className="size-3.5" aria-hidden />
              {formatChange(change)}
              <span className="sr-only">{good ? "(favourable)" : "(unfavourable)"}</span>
            </span>
          ) : (
            <span className="text-subtle">No comparison (N/A)</span>
          )}
          {hasChange && <span className="text-subtle">vs comparison</span>}
        </div>
      )}
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {warning && <div className="text-xs text-warning">⚠ {warning}</div>}
    </Card>
  );
}
