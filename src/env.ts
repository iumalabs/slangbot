/** Worker bindings and configuration. See wrangler.toml and the README. */
export interface Env {
  AI: Ai;
  DB: D1Database;
  KV: KVNamespace;
  IMAGES: R2Bucket;

  // Vars
  TURNSTILE_SITE_KEY: string;
  ACCESS_TEAM_DOMAIN: string;
  /** Language of the daily Telegram channel post: "en" (default) or "ru". */
  TELEGRAM_LOCALE?: string;
  /** Access app AUD tag — public identifier, lives in [vars], not secrets. */
  ADMIN_ACCESS_AUD: string;
  TELEGRAM_ENABLED?: string;

  // Secrets
  TURNSTILE_SECRET: string;
  COOKIE_HMAC_SECRET: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHANNEL_ID?: string;
  /** Where suggestion-moderation notices go: your DM chat id or a private channel id. */
  TELEGRAM_ADMIN_CHAT_ID?: string;
  /** Shared secret Telegram echoes back in the webhook header. */
  TELEGRAM_WEBHOOK_SECRET?: string;
}
