import { AlertOctagon, AlertTriangle, Info, X } from "lucide-react";
import { dismissAlert } from "@/app/actions";
import { cn } from "@/lib/utils";

export interface AlertItem {
  id: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  date: string;
}

const STYLE = {
  CRITICAL: { icon: AlertOctagon, cls: "bg-critical-bg text-critical", label: "Critical" },
  WARNING: { icon: AlertTriangle, cls: "bg-warning-bg text-warning", label: "Warning" },
  INFO: { icon: Info, cls: "bg-info-bg text-primary", label: "Info / opportunity" },
};

export function AlertsList({ alerts, empty = "No open alerts." }: { alerts: AlertItem[]; empty?: string }) {
  if (!alerts.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((a) => {
        const S = STYLE[a.severity];
        return (
          <li key={a.id} className={cn("flex items-start gap-3 rounded-lg p-3 text-sm", S.cls)}>
            <S.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="flex-1">
              <div className="font-medium">
                <span className="sr-only">{S.label}: </span>
                {a.title} <span className="text-xs font-normal opacity-75">· {a.date}</span>
              </div>
              <p className="text-foreground/80">{a.message}</p>
            </div>
            <form action={dismissAlert.bind(null, a.id)}>
              <button type="submit" className="rounded p-1 opacity-60 hover:opacity-100" aria-label={`Dismiss alert: ${a.title}`}>
                <X className="size-4" />
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
