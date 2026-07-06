/** Worker bindings and configuration. See wrangler.toml and the README. */
export interface Env {
  AI: Ai;
  DB: D1Database;
  KV: KVNamespace;
  IMAGES: R2Bucket;

  // Vars
  TURNSTILE_SITE_KEY: string;
  ACCESS_TEAM_DOMAIN: string;
  TELEGRAM_ENABLED?: string;

  // Secrets
  TURNSTILE_SECRET: string;
  COOKIE_HMAC_SECRET: string;
  ADMIN_ACCESS_AUD: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHANNEL_ID?: string;
}
