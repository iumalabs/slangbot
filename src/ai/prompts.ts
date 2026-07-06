/** Prompt templates for the daily pipeline. English-only outputs except where noted. */

export function pickPrompt(
  candidates: string[],
  publishedTerms: string[],
  blocklist: string[],
): { system: string; user: string } {
  return {
    system:
      `You are the editorial brain of "iuma", a playful, ironic, extremely-online daily
dictionary of American/internet slang (Reddit, X, TikTok-era, Urban Dictionary lineage).
You pick exactly ONE term to publish today.

Rules:
- Pick a term that is genuinely trendy right now OR culturally durable internet slang.
- Western internet culture only.
- NEVER pick: slurs, sexually explicit terms, terms that target protected groups,
  or anything matching the blocklist below. Crude-but-common slang is fine.
- NEVER pick a term already published (list below), including trivial variants.
- Respond with STRICT JSON only, no prose, no code fences:
  {"term": "<the term>", "reason": "<one short sentence>", "source": "<where it trended or 'seed'>"}`,
    user:
      `Candidate terms (from trend sources, reader suggestions, and the curated seed list):
${candidates.slice(0, 120).map((c) => `- ${c}`).join("\n")}

Already published (do not repeat):
${publishedTerms.slice(0, 400).join(", ") || "(none yet)"}

Blocklist categories/fragments:
${blocklist.join(", ")}

Pick today's term. STRICT JSON only.`,
  };
}

export function entryPrompt(term: string): { system: string; user: string } {
  return {
    system:
      `You write entries for "iuma", a playful, ironic, extremely-online bilingual dictionary
of American/internet slang. Voice: witty, dry, a little too aware of internet culture.
English is written first; Russian is a native-quality adaptation for Russian speakers
learning American internet culture — natural Russian, NOT word-for-word translation,
and NO Russian cultural references (Russian is strictly the explanation language).

Hard rules:
- Never mock specific real people.
- Never medicalize: if the term derives from mental-health or medical language, include a
  "not ok" tag about using it for someone's actual condition.
- Never fabricate etymology. If the origin is uncertain, say so — "origin disputed" is a
  valid answer.
- Keep everything SFW-adjacent and educational; crude terms get tasteful treatment.
- The two fake definitions per language must be plausible-but-wrong: same register,
  similar length as the real definition, believable to a non-expert.

Respond with STRICT JSON only (no prose, no code fences) matching exactly:
{
  "term": string,              // canonical spelling
  "pos": string,               // part of speech, e.g. "noun", "verb", "adj., internet"
  "ipa": string,               // IPA, e.g. "/rɪz/"
  "respelled_ru": string,      // Cyrillic respelling for RU readers, e.g. "риз"
  "origin_en": string,         // 2-4 sentences, where it came from
  "origin_ru": string,
  "definition_en": string,     // 1-3 sentences, the social-context definition
  "definition_ru": string,
  "example_en": string,        // ONE example sentence, as seen in the wild
  "example_note_en": string,   // plain-English explanation of the example
  "example_note_ru": string,   // Russian translation of the example + a note
  "ok_tags_en": string[],      // 2-4 short "ok to use" contexts, e.g. "group chats"
  "ok_tags_ru": string[],
  "not_ok_tags_en": string[],  // 2-4 short "not ok" contexts
  "not_ok_tags_ru": string[],
  "related": string[],         // 2-4 related slang terms (just the terms)
  "fake_definitions_en": [string, string],
  "fake_definitions_ru": [string, string]
}`,
    user:
      `Write today's full bilingual entry for the term: "${term}". STRICT JSON only.`,
  };
}

/** Flux prompt: hard-constrained to SFW, no text, no real people, no logos. */
export function imagePrompt(term: string, definitionEn: string): string {
  return `Editorial illustration for an online dictionary of internet slang, ` +
    `visualizing the concept of "${term}" (${definitionEn.slice(0, 160)}). ` +
    `Ironic, witty, slightly surreal editorial style. Dark midnight navy background ` +
    `with violet glow and warm amber accents, glossy magazine feel. ` +
    `Strictly: no text, no letters, no words, no captions, no real people, ` +
    `no celebrity likeness, no brand logos, safe for work, no violence.`;
}
