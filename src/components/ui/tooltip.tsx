"use client";
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";

export function InfoTip({ children, label = "More information" }: { children: React.ReactNode; label?: string }) {
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button type="button" aria-label={label} className="inline-flex text-subtle hover:text-foreground">
            <Info className="size-3.5" />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-50 max-w-xs rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground shadow-lg"
          >
            {children}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
