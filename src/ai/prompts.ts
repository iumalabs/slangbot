/** Prompt templates for the daily pipeline. English-only outputs except where noted. */

import { SITE_NAME } from "../config.ts";

export function pickPrompt(
  candidates: string[],
  publishedTerms: string[],
  blocklist: string[],
): { system: string; user: string } {
  return {
    system:
      `You are the editorial brain of "${SITE_NAME}", a playful, ironic, extremely-online daily
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
      `You write entries for "${SITE_NAME}", a playful, ironic, extremely-online bilingual dictionary
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

/**
 * Flux prompt: hard-constrained to SFW, no text, no people, no logos.
 *
 * Deliberately does NOT include the term itself: flux-1-schnell loves to
 * render quoted words as typography, which is exactly the "no text" defect
 * we validate against. Humans are banned outright too — hands and faces are
 * the model's weakest anatomy at 6 steps, so the composition is steered
 * toward metaphorical object scenes instead.
 */
export function imagePrompt(definitionEn: string, attempt = 0): string {
  const retryPrefix = attempt > 0
    ? "IMPORTANT: the previous attempt broke the rules below; follow them exactly this time. "
    : "";
  return `${retryPrefix}Editorial concept illustration for an online dictionary ` +
    `of internet slang. Visualize this idea through objects, symbols and ` +
    `atmosphere only: ${definitionEn.slice(0, 200)}. ` +
    `Ironic, witty, slightly surreal metaphorical still-life composition. ` +
    `Dark midnight navy background with violet glow and warm amber accents, ` +
    `glossy magazine feel. ` +
    `Hard rules: no humans, no faces, no hands, no body parts, no real people, ` +
    `no celebrity likeness, absolutely no text, no letters, no words, no numbers, ` +
    `no typography, no captions, no signage, no brand logos, no watermarks, ` +
    `safe for work, no violence.`;
}

/**
 * Vision-model check of the generated illustration. Kept to two binary
 * questions LLaVA-7B answers reliably.
 */
export const IMAGE_VALIDATION_PROMPT =
  `Look at the image carefully. Respond with STRICT JSON only, no prose: ` +
  `{"has_text": true/false, "has_humans": true/false}. ` +
  `"has_text" is true if the image contains any readable letters, words, ` +
  `numbers or typography. "has_humans" is true if any human figure, face, ` +
  `hand or other body part is visible.`;
