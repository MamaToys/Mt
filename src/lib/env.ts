import "server-only";

/** Server-side environment access. Never import this from client components. */
function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const env = {
  get appUrl() {
    return (opt("APP_URL") ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get authSecret() {
    return opt("AUTH_SECRET");
  },
  get allowSignup() {
    return opt("ALLOW_SIGNUP") !== "false";
  },
  get tokenEncryptionKey() {
    return opt("TOKEN_ENCRYPTION_KEY");
  },
  shopify: {
    get clientId() { return opt("SHOPIFY_CLIENT_ID"); },
    get clientSecret() { return opt("SHOPIFY_CLIENT_SECRET"); },
    get apiVersion() { return opt("SHOPIFY_API_VERSION") ?? "2026-07"; },
    get scopes() { return opt("SHOPIFY_SCOPES") ?? "read_orders,read_all_orders,read_products,read_inventory"; },
    get shopDomain() { return opt("SHOPIFY_SHOP_DOMAIN"); },
    get adminAccessToken() { return opt("SHOPIFY_ADMIN_ACCESS_TOKEN"); },
  },
  meta: {
    get appId() { return opt("META_APP_ID"); },
    get appSecret() { return opt("META_APP_SECRET"); },
    get apiVersion() { return opt("META_API_VERSION") ?? "v24.0"; },
    get accessToken() { return opt("META_ACCESS_TOKEN"); },
  },
  ai: {
    get apiKey() { return opt("AI_API_KEY") ?? opt("ANTHROPIC_API_KEY"); },
    get model() { return opt("AI_MODEL"); },
  },
  get cronSecret() {
    return opt("CRON_SECRET");
  },
  get initialHistoryDays() {
    const n = Number(opt("INITIAL_HISTORY_DAYS") ?? "730");
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 730;
  },
};
