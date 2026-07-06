/** Step 2: one AI call to pick today's term, deduped and blocklist-checked. */

import { extractJson, runText } from "../ai/gateway.ts";
import { pickPrompt } from "../ai/prompts.ts";
import { isBlocked } from "../lib/kv.ts";
import { slugify } from "../lib/slug.ts";
import type { Candidate } from "./harvest.ts";

export interface Pick {
  term: string;
  reason: string;
  source: string;
}

export function parsePickJson(raw: string): Pick {
  const data = extractJson<Record<string, unknown>>(raw);
  const term = typeof data.term === "string" ? data.term.trim() : "";
  if (!term || term.length > 60) throw new Error("pick: invalid term");
  return {
    term,
    reason: typeof data.reason === "string" ? data.reason : "",
    source: typeof data.source === "string" ? data.source : "",
  };
}

export async function pickTerm(
  ai: Ai,
  candidates: Candidate[],
  published: { slug: string; term: string }[],
  blocklist: string[],
): Promise<Pick> {
  const usable = candidates.filter((c) => !isBlocked(c.term, blocklist));
  if (usable.length === 0) throw new Error("no usable candidates");

  const publishedSlugs = new Set(published.map((p) => p.slug));
  const publishedTerms = published.map((p) => p.term);

  const { system, user } = pickPrompt(
    usable.map((c) => `${c.term} (${c.source})`),
    publishedTerms,
    blocklist,
  );
  const raw = await runText(ai, [
    { role: "system", content: system },
    { role: "user", content: user },
  ], 300);
  const pick = parsePickJson(raw);

  // Hard local checks — the model is not trusted with policy.
  if (isBlocked(pick.term, blocklist)) throw new Error(`pick blocked: ${pick.term}`);
  if (publishedSlugs.has(slugify(pick.term))) {
    // Deterministic fallback: first unpublished, unblocked candidate.
    const fallback = usable.find((c) => !publishedSlugs.has(slugify(c.term)));
    if (!fallback) throw new Error("all candidates already published");
    return { term: fallback.term, reason: "fallback: model picked a duplicate", source: fallback.source };
  }
  return pick;
}
