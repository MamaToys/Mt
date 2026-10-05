import "server-only";
import { ApiError, sleep, withRetry } from "../http";
import { env } from "../env";

export interface ShopifyCreds {
  shopDomain: string;
  accessToken: string;
}

interface GqlResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number | null;
      throttleStatus: { maximumAvailable: number; currentlyAvailable: number; restoreRate: number };
    };
  };
}

/**
 * Shopify Admin GraphQL client with cost-based throttle handling: it waits for
 * the leaky bucket to refill when a query is THROTTLED, and pre-emptively
 * slows down when the bucket is nearly empty.
 */
export async function shopifyGraphql<T>(creds: ShopifyCreds, query: string, variables?: Record<string, unknown>): Promise<T> {
  const url = `https://${creds.shopDomain}/admin/api/${env.shopify.apiVersion}/graphql.json`;
  return withRetry(
    async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": creds.accessToken },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        throw new ApiError(`Shopify rejected the access token (${res.status}). Reconnect Shopify.`, "auth", res.status);
      }
      if (res.status === 402) throw new ApiError("Shopify store is frozen / payment required (402).", "permanent", 402);
      if (res.status === 404) throw new ApiError(`Shopify store not found: ${creds.shopDomain}`, "permanent", 404);
      if (res.status === 429) {
        const ra = Number(res.headers.get("Retry-After") ?? "2");
        throw new ApiError("Shopify rate limit (429).", "rate_limit", 429, ra * 1000);
      }
      if (res.status >= 500) throw new ApiError(`Shopify server error ${res.status}.`, "transient", res.status);
      if (!res.ok) throw new ApiError(`Shopify request failed: ${res.status} ${await res.text()}`, "permanent", res.status);

      const body = (await res.json()) as GqlResponse<T>;
      const cost = body.extensions?.cost;
      if (body.errors?.length) {
        if (body.errors.some((e) => e.extensions?.code === "THROTTLED")) {
          const need = cost ? Math.max(0, cost.requestedQueryCost - cost.throttleStatus.currentlyAvailable) : 100;
          const waitMs = cost ? (need / cost.throttleStatus.restoreRate) * 1000 + 250 : 2000;
          throw new ApiError("Shopify GraphQL throttled.", "rate_limit", 200, waitMs);
        }
        if (body.errors.some((e) => e.extensions?.code === "ACCESS_DENIED")) {
          throw new ApiError(`Shopify access denied: ${body.errors.map((e) => e.message).join("; ")}`, "auth");
        }
        throw new ApiError(`Shopify GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`, "permanent");
      }
      // Be polite: if the bucket is below 20 %, wait for it to refill a bit.
      if (cost && cost.throttleStatus.currentlyAvailable < cost.throttleStatus.maximumAvailable * 0.2) {
        await sleep((cost.requestedQueryCost / cost.throttleStatus.restoreRate) * 1000);
      }
      return body.data as T;
    },
    { retries: 6 },
  );
}

/** "gid://shopify/Order/123" → "123" */
export function gidToId(gid: string | null | undefined): string | null {
  if (!gid) return null;
  const m = /\/(\d+)$/.exec(gid);
  return m ? m[1] : gid;
}

export const orderGid = (id: string) => `gid://shopify/Order/${id}`;

/** Normalises and validates a *.myshopify.com domain. */
export function normalizeShopDomain(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const withSuffix = s.includes(".") ? s : `${s}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(withSuffix) ? withSuffix : null;
}
