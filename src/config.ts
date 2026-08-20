/**
 * Owner-editable brand constants.
 * SITE_NAME is the product name (shown in the wordmark, titles, share
 * strings). It is intentionally distinct from the domain — see
 * CANONICAL_ORIGIN / SHARE_HOST below, which stay "slangbot.iuma.dev".
 */
export const SITE_NAME = "slangbot";
export const TAGLINE = "the Internet's Unofficial Manual of Argot";

/** Canonical origin for permalinks, OG tags, RSS and the sitemap. Always https. */
export const CANONICAL_ORIGIN = "https://slangbot.iuma.dev";

/** Short host shown in share strings ("slangbot.iuma.dev"). */
export const SHARE_HOST = "slangbot.iuma.dev";
