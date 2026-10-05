import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm tabular", className)} {...props} />
    </div>
  );
}
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...p} className={cn("border-b border-border", p.className)} />;
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} className={cn("[&_tr:last-child]:border-0", p.className)} />;
export const TR = (p: React.HTMLAttributes<HTMLTableRowElement>) => <tr {...p} className={cn("border-b border-border hover:bg-muted/50", p.className)} />;
export const TH = (p: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th {...p} className={cn("h-9 px-3 text-left align-middle text-xs font-medium text-muted-foreground whitespace-nowrap", p.className)} />
);
export const TD = (p: React.TdHTMLAttributes<HTMLTableCellElement>) => <td {...p} className={cn("px-3 py-2 align-middle whitespace-nowrap", p.className)} />;
