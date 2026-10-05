"use client";
import { useActionState } from "react";
import { Button } from "./button";
import type { ActionResult } from "@/app/actions";
import { cn } from "@/lib/utils";

export function ActionForm({
  action,
  submitLabel = "Save",
  children,
  className,
}: {
  action: (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;
  submitLabel?: string;
  children: React.ReactNode;
  className?: string;
  /** React resets uncontrolled form fields after each submission. */
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(async (prev: ActionResult | null, form: FormData) => {
    const r = await action(prev, form);
    return r;
  }, null);
  return (
    <form action={formAction} className={cn("flex flex-col gap-3", className)}>
      {children}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        {state?.message && (
          <p role="status" className={cn("text-sm", state.ok ? "text-good" : "text-critical")}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
