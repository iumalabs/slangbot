/** KV usage: config (blocklist, trend sources), counters, caches. */

export const KV_KEYS = {
  blocklist: "config:blocklist",
  sources: "config:sources",
  ogPrefix: "og:",
  guessPrefix: "guess:",
  suggestRatePrefix: "suggest-rate:",
} as const;

/**
 * Seed blocklist: categories the site never covers. Substring-matched,
 * lowercase. Admin-editable in KV (one entry per line).
 */
export const DEFAULT_BLOCKLIST: string[] = [
  // The list holds category markers and high-risk fragments, not an
  // exhaustive slur dictionary — the pick prompt carries the policy too.
  "slur",
  "n-word",
  "r-word",
  "f-slur",
  "rape",
  "nazi",
  "hitler",
  "porn",
  "hentai",
  "blowjob",
  "cum",
  "grape (assault)",
];

export interface TrendSource {
  /** "urban" | "reddit-rss" | "rss" */
  type: string;
  url: string;
}

export const DEFAULT_SOURCES: TrendSource[] = [
  { type: "urban", url: "https://api.urbandictionary.com/v0/words_of_the_day" },
  { type: "urban", url: "https://api.urbandictionary.com/v0/random" },
  { type: "reddit-rss", url: "https://www.reddit.com/r/OutOfTheLoop/.rss?limit=25" },
  { type: "reddit-rss", url: "https://www.reddit.com/r/slang/.rss?limit=25" },
  { type: "rss", url: "https://knowyourmeme.com/newsfeed.rss" },
];

export async function getBlocklist(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(KV_KEYS.blocklist);
  if (!raw) return DEFAULT_BLOCKLIST;
  return raw.split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function getSources(kv: KVNamespace): Promise<TrendSource[]> {
  const raw = await kv.get(KV_KEYS.sources);
  if (!raw) return DEFAULT_SOURCES;
  try {
    const parsed = JSON.parse(raw) as TrendSource[];
    return Array.isArray(parsed) ? parsed.filter((s) => s?.url) : DEFAULT_SOURCES;
  } catch {
    return DEFAULT_SOURCES;
  }
}

export function isBlocked(term: string, blocklist: string[]): boolean {
  const t = term.toLowerCase();
  return blocklist.some((b) => b && t.includes(b.split(" (")[0]));
}
