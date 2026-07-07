/**
 * Owner-editable brand constants.
 * SITE_NAME is the product name (shown in the wordmark, titles, share
 * strings). It is intentionally distinct from the domain — see
 * CANONICAL_ORIGIN / SHARE_HOST below, which stay "iuma.dev".
 */
export const SITE_NAME = "slangbot";
export const TAGLINE = "the Internet's Unofficial Manual of Argot";

/**
 * Canonical origin for permalinks, OG tags, RSS and the sitemap.
 * `.dev` is HSTS-preloaded, so this must always be https.
 */
export const CANONICAL_ORIGIN = "https://iuma.dev";

/** Short host shown in share strings ("iuma.dev"). */
export const SHARE_HOST = "iuma.dev";
