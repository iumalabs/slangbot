/** Step 1: harvest candidate terms from public sources + suggestions + seeds. */

import type { Env } from "../env.ts";
import { getSources } from "../lib/kv.ts";
import { getApprovedSuggestions, getUnusedSeedTerms } from "../lib/d1.ts";

export interface Candidate {
  term: string;
  source: string;
}

const FETCH_TIMEOUT_MS = 8000;

async function safeFetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "iuma-bot/1.0 (+https://iuma.dev)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Urban Dictionary JSON: {"list":[{"word": "..."}]} */
export function parseUrban(json: string): string[] {
  try {
    const data = JSON.parse(json) as { list?: { word?: string }[] };
    if (!Array.isArray(data.list)) return [];
    return data.list
      .map((e) => (typeof e.word === "string" ? e.word.trim() : ""))
      .filter((w) => w && w.length <= 40);
  } catch {
    return [];
  }
}

/** Extract <title> texts from an RSS/Atom feed, dropping the channel title. */
export function parseFeedTitles(xml: string): string[] {
  const titles: string[] = [];
  const re =
    /<title(?:\s[^>]*)?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    // Strip markup until the text is stable (a single pass can leave a tag
    // behind when tags nest into each other after a removal).
    let text = m[1];
    let previous;
    do {
      previous = text;
      text = text.replace(/<[^>]*>/g, "");
    } while (text !== previous);
    text = text.trim();
    if (text) titles.push(text);
  }
  return titles.slice(1, 40); // skip channel title
}

/**
 * Quoted-phrase matcher: curly “…”, straight "…", or '…' — captured without
 * the quotes so no post-trim is needed.
 */
const QUOTED_RE = /“([^”]{2,40})”|"([^"]{2,40})"|'([^']{2,40})'/g;

/**
 * Pull candidate phrases out of feed titles: quoted phrases and
 * "what does X mean" patterns. Defensive — garbage in, nothing out.
 */
export function extractTermsFromTitles(titles: string[]): string[] {
  const out: string[] = [];
  for (const title of titles) {
    for (const m of title.matchAll(QUOTED_RE)) {
      const phrase = m[1] ?? m[2] ?? m[3];
      if (phrase) out.push(phrase.trim());
    }
    const meanMatch = title.match(
      /what (?:does|is) ([\w' -]{2,40}?) (?:mean|slang|about)/i,
    );
    if (meanMatch) out.push(meanMatch[1].trim());
  }
  return out.filter((t) => t && /[a-z]/i.test(t));
}

export async function harvestCandidates(env: Env): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  // Highest priority: reader suggestions approved by the admin.
  const approved = await getApprovedSuggestions(env.DB);
  for (const s of approved) {
    candidates.push({ term: s.term, source: "reader suggestion" });
  }

  // Trend sources (config in KV, editable from admin). Each parsed defensively.
  const sources = await getSources(env.KV);
  for (const src of sources) {
    const body = await safeFetchText(src.url);
    if (!body) continue;
    let terms: string[] = [];
    if (src.type === "urban") {
      terms = parseUrban(body);
    } else {
      terms = extractTermsFromTitles(parseFeedTitles(body));
    }
    for (const term of terms.slice(0, 15)) {
      candidates.push({ term, source: new URL(src.url).hostname });
    }
  }

  // Fallback supply so the pipeline never runs dry.
  const seeds = await getUnusedSeedTerms(env.DB, 30);
  for (const term of seeds) {
    candidates.push({ term, source: "seed" });
  }

  // De-duplicate, keep first (= highest priority) occurrence.
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = c.term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
