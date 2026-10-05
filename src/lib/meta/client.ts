import "server-only";
import { ApiError, sleep, withRetry } from "../http";
import { env } from "../env";

const GRAPH = "https://graph.facebook.com";

interface MetaErrorBody {
  error?: { message: string; type?: string; code?: number; error_subcode?: number; is_transient?: boolean };
}

/** Meta error codes that mean "slow down". */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014]);

function usagePct(headers: Headers): { pct: number; regainMinutes: number } {
  let pct = 0;
  let regainMinutes = 0;
  for (const h of ["x-business-use-case-usage", "x-ad-account-usage", "x-app-usage"]) {
    const raw = headers.get(h);
    if (!raw) continue;
    try {
      const v = JSON.parse(raw) as unknown;
      const walk = (o: unknown) => {
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === "object") {
          for (const [k, val] of Object.entries(o as Record<string, unknown>)) {
            if (typeof val === "number" && /call_count|total_cputime|total_time|acc_id_util_pct/.test(k)) pct = Math.max(pct, val);
            if (typeof val === "number" && k === "estimated_time_to_regain_access") regainMinutes = Math.max(regainMinutes, val);
            if (val && typeof val === "object") walk(val);
          }
        }
      };
      walk(v);
    } catch {
      /* ignore malformed usage headers */
    }
  }
  return { pct, regainMinutes };
}

/**
 * GET a Graph API path with retries, rate-limit back-off and typed errors.
 * Access tokens are sent in the Authorization header (never in URLs that might be logged).
 */
export async function metaGet<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = path.startsWith("https://") ? new URL(path) : new URL(`${GRAPH}/${env.meta.apiVersion}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.delete("access_token");
  return withRetry(
    async () => {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const usage = usagePct(res.headers);
      const body = (await res.json().catch(() => ({}))) as T & MetaErrorBody;
      if (!res.ok || body.error) {
        const err = body.error;
        const code = err?.code ?? res.status;
        const msg = `Meta API error ${code}${err?.error_subcode ? `/${err.error_subcode}` : ""}: ${err?.message ?? res.statusText}`;
        if (code === 190 || code === 102 || code === 10 || (code >= 200 && code < 300)) throw new ApiError(`${msg}. Reconnect Meta Ads.`, "auth", res.status);
        if (RATE_LIMIT_CODES.has(code) || res.status === 429) {
          throw new ApiError(msg, "rate_limit", res.status, Math.max(60_000, usage.regainMinutes * 60_000));
        }
        if (err?.is_transient || res.status >= 500 || code === 1 || code === 2) throw new ApiError(msg, "transient", res.status);
        throw new ApiError(msg, "permanent", res.status);
      }
      if (usage.pct >= 75) await sleep(Math.min(60_000, (usage.pct - 70) * 2_000)); // back off before hitting the limit
      return body;
    },
    { retries: 5, baseMs: 2_000, maxMs: 300_000 },
  );
}

/** Follows `paging.next` cursors and returns all rows. */
export async function metaGetAll<T>(path: string, token: string, params: Record<string, string> = {}, maxPages = 500): Promise<T[]> {
  const out: T[] = [];
  let page = await metaGet<{ data: T[]; paging?: { next?: string } }>(path, token, params);
  out.push(...page.data);
  for (let i = 0; page.paging?.next && i < maxPages; i++) {
    page = await metaGet<{ data: T[]; paging?: { next?: string } }>(page.paging.next, token);
    out.push(...page.data);
  }
  return out;
}
