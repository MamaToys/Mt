import { Suspense } from "react";
import { requireStore } from "@/lib/session";
import { parseView, SearchParams } from "@/lib/params";
import { loadProducts, shopifyCovered } from "@/lib/reports/queries";
import { db } from "@/lib/db";
import { fromDbDate } from "@/lib/metrics/dates";
import { formatMoney, formatNumber, formatPct } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input, Field } from "@/components/ui/input";
import { ActionForm } from "@/components/ui/action-form";
import { ExportLinks } from "@/components/dash/export-links";
import { Gaps, Notes, PageHeader } from "@/components/dash/notices";
import { deleteProductCost, saveProductCost } from "@/app/actions";
import { CostRowForm } from "./cost-row";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { store } = await requireStore();
  const view = parseView(await searchParams, store);
  const [products, variants, soldVariants, costs, covered] = await Promise.all([
    loadProducts(store.id, view.range),
    db.shopifyVariant.findMany({ where: { product: { storeId: store.id } }, include: { product: true }, orderBy: { product: { title: "asc" } }, take: 1000 }),
    db.shopifyOrderLineItem.groupBy({
      by: ["variantExternalId", "productExternalId", "sku", "title"],
      where: { order: { storeId: store.id, test: false }, isGiftCard: false },
      _sum: { quantity: true },
    }),
    db.productCost.findMany({ where: { storeId: store.id }, orderBy: { effectiveFrom: "desc" } }),
    shopifyCovered(store.id, view.range),
  ]);
  const c = store.currency;
  const manualBy = new Map<string, typeof costs>();
  const shopifyBy = new Map<string, (typeof costs)[number]>();
  for (const pc of costs) {
    const key = pc.variantExternalId ?? `sku:${pc.sku?.toLowerCase()}`;
    if (pc.source === "MANUAL") manualBy.set(key, [...(manualBy.get(key) ?? []), pc]);
    else if (!shopifyBy.has(key)) shopifyBy.set(key, pc);
  }
  type Row = { variantId: string | null; productId: string | null; sku: string | null; title: string; unitsSold: number; shopifyCost: number | null };
  const rows = new Map<string, Row>();
  for (const v of variants) {
    rows.set(v.externalId, {
      variantId: v.externalId, productId: v.product.externalId, sku: v.sku,
      title: `${v.product.title}${v.title && v.title !== "Default Title" ? ` — ${v.title}` : ""}`,
      unitsSold: 0, shopifyCost: v.shopifyUnitCost === null ? null : Number(v.shopifyUnitCost),
    });
  }
  for (const s of soldVariants) {
    const key = s.variantExternalId ?? `sku:${s.sku}:${s.title}`;
    const r = rows.get(key) ?? { variantId: s.variantExternalId, productId: s.productExternalId, sku: s.sku, title: s.title, unitsSold: 0, shopifyCost: null };
    r.unitsSold += s._sum.quantity ?? 0;
    rows.set(key, r);
  }
  const list = [...rows.values()].map((r) => {
    const manual = manualBy.get(r.variantId ?? "") ?? (r.sku ? manualBy.get(`sku:${r.sku.toLowerCase()}`) : undefined) ?? [];
    const shop = shopifyBy.get(r.variantId ?? "");
    const shopifyCost = r.shopifyCost ?? (shop ? Number(shop.costPerUnit) : null);
    const effective = manual.length ? Number(manual[0].costPerUnit) : shopifyCost;
    return { ...r, manual, shopifyCost, effective };
  }).sort((a, b) => (a.effective === null ? -1 : 0) - (b.effective === null ? -1 : 0) || b.unitsSold - a.unitsSold);
  const missing = list.filter((r) => r.effective === null && r.unitsSold > 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Products" description={`Product profitability · ${view.label}`}>
        <Suspense><ExportLinks reports={[{ id: "products", label: "Product CSV" }]} /></Suspense>
      </PageHeader>
      {!covered && <Gaps gaps={["Shopify data is not complete for every day in this range (initial import still running or days before your imported history). Product totals below cover only the complete days."]} />}
      <Notes notes={["Product-level advertising allocation is unavailable: Meta spend cannot be reliably attributed to individual products, so product profit here is gross profit (net sales − product cost) before ads and overhead."]} />
      <Card>
        <CardHeader><CardTitle>Product profitability</CardTitle><CardDescription>Returns are counted on the refund date; restocked units reverse their cost.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Product</TH><TH className="text-right">Units sold</TH><TH className="text-right">Gross sales</TH><TH className="text-right">Discounts</TH>
                <TH className="text-right">Returns</TH><TH className="text-right">Net sales</TH><TH className="text-right">Product cost</TH>
                <TH className="text-right">Ad spend allocation</TH><TH className="text-right">Gross profit</TH><TH className="text-right">Margin</TH>
              </TR>
            </THead>
            <TBody>
              {products.length === 0 && <TR><TD colSpan={10} className="py-6 text-center text-muted-foreground">No product sales in this period.</TD></TR>}
              {products.map((p) => (
                <TR key={p.productId}>
                  <TD className="max-w-72 truncate" title={p.title}>{p.title}</TD>
                  <TD className="text-right">{formatNumber(p.unitsSold)}</TD>
                  <TD className="text-right">{formatMoney(p.grossSales, c)}</TD>
                  <TD className="text-right">{formatMoney(p.discounts, c)}</TD>
                  <TD className="text-right">{formatMoney(p.returns, c)}</TD>
                  <TD className="text-right font-medium">{formatMoney(p.netSales, c)}</TD>
                  <TD className="text-right">
                    {p.unitsMissingCost > 0 ? <Badge variant="warning" title={`${p.unitsMissingCost} units have no cost`}>Missing cost ({p.unitsMissingCost})</Badge> : formatMoney(p.productCost, c)}
                  </TD>
                  <TD className="text-right text-subtle" title="Meta spend cannot be reliably allocated to products">Unavailable</TD>
                  <TD className="text-right">{p.unitsMissingCost > 0 ? <span className="text-subtle">N/A</span> : formatMoney(p.grossProfit, c)}</TD>
                  <TD className="text-right">{p.unitsMissingCost > 0 ? <span className="text-subtle">N/A</span> : formatPct(p.margin)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product costs</CardTitle>
          <CardDescription>
            Cost per unit in {c}. Shopify&apos;s &quot;Cost per item&quot; is imported automatically; a manual cost overrides it from its effective date.
            {missing.length > 0 ? ` ${missing.length} sold item(s) have NO cost — profit excludes them until you add one.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <THead>
              <TR><TH>Variant</TH><TH>SKU</TH><TH className="text-right">Units sold (all time)</TH><TH className="text-right">Shopify cost</TH><TH>Manual override</TH><TH className="text-right">Effective cost</TH><TH>Set manual cost</TH></TR>
            </THead>
            <TBody>
              {list.slice(0, 500).map((r) => (
                <TR key={(r.variantId ?? "") + (r.sku ?? "") + r.title}>
                  <TD className="max-w-64 truncate" title={r.title}>{r.title}</TD>
                  <TD className="text-xs text-muted-foreground">{r.sku ?? "—"}</TD>
                  <TD className="text-right">{formatNumber(r.unitsSold)}</TD>
                  <TD className="text-right">{r.shopifyCost === null ? <span className="text-subtle">none</span> : formatMoney(r.shopifyCost, c)}</TD>
                  <TD className="text-xs">
                    {r.manual.map((m) => (
                      <form key={m.id} action={deleteProductCost.bind(null, m.id)} className="flex items-center gap-1">
                        {formatMoney(Number(m.costPerUnit), m.currency)} from {fromDbDate(m.effectiveFrom) === "1970-01-01" ? "always" : fromDbDate(m.effectiveFrom)}
                        <button className="text-critical underline" type="submit">remove</button>
                      </form>
                    ))}
                  </TD>
                  <TD className="text-right">{r.effective === null ? <Badge variant="warning">Missing</Badge> : formatMoney(r.effective, c)}</TD>
                  <TD><CostRowForm variantExternalId={r.variantId} productExternalId={r.productId} sku={r.sku} title={r.title} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a cost by SKU</summary>
            <ActionForm action={saveProductCost} className="mt-3 max-w-md">
              <Field label="SKU"><Input name="sku" required /></Field>
              <Field label="Product name (optional)"><Input name="title" /></Field>
              <Field label={`Cost per unit (${c})`}><Input name="costPerUnit" type="number" step="0.0001" min="0" required /></Field>
              <Field label="Effective from (optional)" hint="Leave empty to apply to all history"><Input name="effectiveFrom" type="date" /></Field>
            </ActionForm>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
