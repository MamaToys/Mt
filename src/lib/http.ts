/** Shared HTTP helpers: typed errors and exponential backoff. */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "rate_limit" | "transient" | "permanent",
    public readonly status?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: { retries?: number; baseMs?: number; maxMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 4;
  const base = opts.baseMs ?? 1000;
  const max = opts.maxMs ?? 60_000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      const retryable = e instanceof ApiError ? e.kind === "rate_limit" || e.kind === "transient" : isNetworkError(e);
      if (!retryable || attempt >= retries) throw e;
      const hinted = e instanceof ApiError ? e.retryAfterMs : undefined;
      const backoff = Math.min(max, hinted ?? base * 2 ** attempt) * (0.85 + Math.random() * 0.3);
      await sleep(backoff);
    }
  }
}

function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof Error && /ECONNRESET|ETIMEDOUT|fetch failed|socket/i.test(e.message));
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
