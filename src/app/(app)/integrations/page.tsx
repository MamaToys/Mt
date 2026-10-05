import { requireStore } from "@/lib/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { shopifyOAuthConfigured } from "@/lib/shopify/oauth";
import { metaOAuthConfigured } from "@/lib/meta/oauth";
import { formatDateTime, timeAgo } from "@/lib/format";
import { fromDbDate, todayIn } from "@/lib/metrics/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ActionForm } from "@/components/ui/action-form";
import { PageHeader } from "@/components/dash/notices";
import { connectMetaWithToken, connectShopifyWithToken, deleteFxRate, disconnect, saveFxRate, setAdAccountSelected } from "@/app/actions";

export const dynamic = "force-dynamic";

const STATUS = { ACTIVE: "good", PENDING: "info", ERROR: "critical", EXPIRED: "critical", DISCONNECTED: "outline" } as const;

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { store } = await requireStore();
  const [shop, meta, accounts, rates] = await Promise.all([
    db.shopifyConnection.findUnique({ where: { storeId: store.id } }),
    db.metaConnection.findUnique({ where: { storeId: store.id } }),
    db.metaAdAccount.findMany({ where: { storeId: store.id }, orderBy: { name: "asc" } }),
    db.exchangeRate.findMany({ where: { storeId: store.id }, orderBy: [{ base: "asc" }, { quote: "asc" }, { date: "desc" }], take: 100 }),
  ]);
  const tz = store.timezone;
  const shopActive = shop && shop.status !== "DISCONNECTED";
  const metaActive = meta && meta.status !== "DISCONNECTED";
  const foreign = accounts.filter((a) => a.isSelected && a.currency !== store.currency);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Integrations" description="Platform credentials are stored encrypted on the server and are never sent to the browser." />
      {sp.error && <div role="alert" className="rounded-md bg-critical-bg p-3 text-sm text-critical">Connection error: {sp.error}</div>}
      {sp.connected && <div role="status" className="rounded-md bg-good-bg p-3 text-sm text-good">Connected {sp.connected === "meta" ? "Meta Ads" : "Shopify"}. {sp.connected === "meta" ? "Select the ad accounts to report on below." : "The initial historical import has started — progress appears in Sync Logs."}</div>}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Shopify {shop && <Badge variant={STATUS[shop.status]}>{shop.status.toLowerCase()}</Badge>}</CardTitle>
            <CardDescription>Orders, refunds, products and cost per item via the Shopify Admin GraphQL API.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {shopActive ? (
              <>
                <dl className="grid grid-cols-[160px_1fr] gap-y-1">
                  <dt className="text-muted-foreground">Store</dt><dd>{shop.shopName} ({shop.shopDomain})</dd>
                  <dt className="text-muted-foreground">Currency / timezone</dt><dd>{shop.shopCurrency} · {shop.shopTimezone}</dd>
                  <dt className="text-muted-foreground">History from</dt><dd>{shop.historyFrom ? fromDbDate(shop.historyFrom) : "—"}{(shop.scopes ?? "").includes("read_all_orders") || !shop.scopes ? "" : " (limited to 60 days: read_all_orders not granted)"}</dd>
                  <dt className="text-muted-foreground">Initial import</dt><dd>{shop.initialImportCompletedAt ? `complete (${formatDateTime(shop.initialImportCompletedAt, tz)})` : "in progress — Shopify figures show N/A until it finishes"}</dd>
                  <dt className="text-muted-foreground">Last successful sync</dt><dd>{formatDateTime(shop.lastSuccessfulSyncAt, tz)} ({timeAgo(shop.lastSuccessfulSyncAt)})</dd>
                  <dt className="text-muted-foreground">Webhooks</dt><dd>{shop.webhooksRegisteredAt ? `registered ${formatDateTime(shop.webhooksRegisteredAt, tz)}` : "not registered — scheduled sync every 15 min is used"}</dd>
                  {shop.lastError && (<><dt className="text-critical">Last error</dt><dd className="text-critical">{shop.lastError}</dd></>)}
                </dl>
                <form action={disconnect.bind(null, "shopify")}><Button variant="outline" size="sm" type="submit">Disconnect (keeps imported history)</Button></form>
              </>
            ) : (
              <>
                {shopifyOAuthConfigured() ? (
                  <form action="/api/integrations/shopify/install" method="get" className="flex flex-wrap items-end gap-2">
                    <Field label="Shop domain" className="flex-1"><Input name="shop" placeholder="your-store.myshopify.com" required /></Field>
                    <Button type="submit">Connect with Shopify</Button>
                  </form>
                ) : (
                  <p className="text-muted-foreground">OAuth is not configured (set SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET). You can connect a custom app token instead:</p>
                )}
                <details open={!shopifyOAuthConfigured()} className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer font-medium">Connect with a custom-app Admin API token</summary>
                  <p className="my-2 text-xs text-muted-foreground">In Shopify admin → Settings → Apps → Develop apps, create an app with scopes read_orders, read_all_orders (for history older than 60 days), read_products, read_inventory, install it and copy the Admin API access token.</p>
                  <ActionForm action={connectShopifyWithToken} submitLabel="Connect">
                    <Field label="Shop domain"><Input name="shop" placeholder="your-store.myshopify.com" defaultValue={env.shopify.shopDomain ?? ""} required /></Field>
                    <Field label="Admin API access token"><Input name="token" type="password" autoComplete="off" placeholder="shpat_…" required /></Field>
                    <Field label="Granted scopes" hint="Comma-separated, used to determine available order history"><Input name="scopes" defaultValue="read_orders,read_all_orders,read_products,read_inventory" /></Field>
                  </ActionForm>
                </details>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Meta Ads {meta && <Badge variant={STATUS[meta.status]}>{meta.status.toLowerCase()}</Badge>}</CardTitle>
            <CardDescription>Campaign, ad set and ad insights via the Meta Marketing API (ads_read).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {metaActive ? (
              <>
                <dl className="grid grid-cols-[160px_1fr] gap-y-1">
                  <dt className="text-muted-foreground">Connected as</dt><dd>{meta.metaUserName ?? meta.metaUserId}</dd>
                  <dt className="text-muted-foreground">Token expires</dt><dd>{meta.tokenExpiresAt ? formatDateTime(meta.tokenExpiresAt, tz) : "does not expire (system user) / unknown"}</dd>
                  <dt className="text-muted-foreground">Last successful sync</dt><dd>{formatDateTime(meta.lastSuccessfulSyncAt, tz)} ({timeAgo(meta.lastSuccessfulSyncAt)})</dd>
                  {meta.lastError && (<><dt className="text-critical">Last error</dt><dd className="whitespace-pre-wrap text-critical">{meta.lastError}</dd></>)}
                </dl>
                <div>
                  <h3 className="mb-1 font-medium">Ad accounts</h3>
                  {accounts.length === 0 && <p className="text-muted-foreground">No ad accounts visible to this token.</p>}
                  <ul className="flex flex-col gap-1">
                    {accounts.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                        <form action={setAdAccountSelected.bind(null, a.id, !a.isSelected)}>
                          <button type="submit" role="switch" aria-checked={a.isSelected} className={`h-5 w-9 rounded-full p-0.5 ${a.isSelected ? "bg-primary" : "bg-muted"}`} aria-label={`Report on ${a.name}`}>
                            <span className={`block size-4 rounded-full bg-white transition ${a.isSelected ? "translate-x-4" : ""}`} />
                          </button>
                        </form>
                        <span className="font-medium">{a.name}</span>
                        <span className="text-xs text-muted-foreground">{a.externalId} · {a.currency} · {a.timezone ?? "tz unknown"}</span>
                        {a.isSelected && <span className="text-xs text-muted-foreground">data {a.insightsFrom ? `${fromDbDate(a.insightsFrom)} → ${fromDbDate(a.insightsThrough!)}` : "not synced yet"}</span>}
                        {a.currency !== store.currency && <Badge variant="warning">needs {a.currency}→{store.currency} rate</Badge>}
                        {a.timezone && a.timezone !== store.timezone && <Badge variant="outline">timezone differs from store</Badge>}
                      </li>
                    ))}
                  </ul>
                </div>
                <form action={disconnect.bind(null, "meta")}><Button variant="outline" size="sm" type="submit">Disconnect (keeps imported history)</Button></form>
              </>
            ) : (
              <>
                {metaOAuthConfigured() ? (
                  <Button asChild className="self-start"><a href="/api/integrations/meta/connect">Connect with Facebook</a></Button>
                ) : (
                  <p className="text-muted-foreground">OAuth is not configured (set META_APP_ID / META_APP_SECRET). You can paste a system-user token instead:</p>
                )}
                <details open={!metaOAuthConfigured()} className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer font-medium">Connect with an access token</summary>
                  <p className="my-2 text-xs text-muted-foreground">Business Settings → System users → Generate token with the ads_read permission for your ad account(s).</p>
                  <ActionForm action={connectMetaWithToken} submitLabel="Connect">
                    <Field label="Access token"><Input name="token" type="password" autoComplete="off" required /></Field>
                  </ActionForm>
                </details>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Exchange rates</CardTitle>
          <CardDescription>
            Reporting currency: <strong>{store.currency}</strong>. When a Meta account (or product cost) uses another currency, it is converted with the most recent rate on or before each day (up to 7 days back).
            If no rate exists, those amounts are reported as unavailable — currencies are never mixed silently.
            {foreign.length > 0 ? ` Needed: ${[...new Set(foreign.map((a) => `${a.currency}→${store.currency}`))].join(", ")}.` : ""} Add a rate per day (or at least weekly) for accurate conversion.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ActionForm action={saveFxRate} submitLabel="Save rate" className="max-w-2xl">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Field label="1 unit of"><Input name="base" defaultValue={foreign[0]?.currency ?? ""} placeholder="EUR" maxLength={3} required /></Field>
              <Field label="= rate"><Input name="rate" type="number" step="0.00000001" min="0" required /></Field>
              <Field label="of"><Input name="quote" defaultValue={store.currency} maxLength={3} required /></Field>
              <Field label="Valid from"><Input name="date" type="date" defaultValue={todayIn(tz)} required /></Field>
            </div>
          </ActionForm>
          {rates.length > 0 && (
            <ul className="text-sm">
              {rates.map((r) => (
                <li key={r.id} className="flex items-center gap-2 border-t border-border py-1">
                  <span className="tabular">{fromDbDate(r.date)}: 1 {r.base} = {Number(r.rate)} {r.quote}</span>
                  <span className="text-xs text-subtle">({r.source})</span>
                  <form action={deleteFxRate.bind(null, r.id)}><button className="text-xs text-critical underline" type="submit">remove</button></form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
