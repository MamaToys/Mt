"use client";
import { useActionState } from "react";
import { saveProductCost } from "@/app/actions";

export function CostRowForm(p: { variantExternalId: string | null; productExternalId: string | null; sku: string | null; title: string }) {
  const [state, action, pending] = useActionState(saveProductCost, null);
  return (
    <form action={action} className="flex items-center gap-1">
      {p.variantExternalId && <input type="hidden" name="variantExternalId" value={p.variantExternalId} />}
      {p.productExternalId && <input type="hidden" name="productExternalId" value={p.productExternalId} />}
      {p.sku && <input type="hidden" name="sku" value={p.sku} />}
      <input type="hidden" name="title" value={p.title.slice(0, 255)} />
      <input name="costPerUnit" type="number" step="0.0001" min="0" required aria-label={`Cost per unit for ${p.title}`} className="h-8 w-24 rounded-md border border-border bg-card px-2 text-sm" />
      <input name="effectiveFrom" type="date" aria-label="Effective from" className="h-8 rounded-md border border-border bg-card px-1 text-xs" />
      <button type="submit" disabled={pending} className="h-8 rounded-md bg-primary px-2 text-xs text-primary-foreground disabled:opacity-50">{pending ? "…" : "Save"}</button>
      {state?.message && <span className={state.ok ? "text-xs text-good" : "text-xs text-critical"}>{state.ok ? "✓" : state.message}</span>}
    </form>
  );
}
