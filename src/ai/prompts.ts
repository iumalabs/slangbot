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

THE GUESSING GAME (the most important part). The two fake definitions per language are
shown next to the real one and readers must NOT be able to tell which is which. Rules
for definition_en/definition_ru AND both fakes, all six texts:
- All the same shape: 1-2 sentences, 120-220 characters. The real definition must NOT
  be the longest or the most detailed one — readers exploit that instantly.
- Never quote, spell out, restate or translate the term itself inside any of the six
  definition texts ("chronically online refers to..." is an instant giveaway).
- Fakes stay INSIDE internet/slang culture: each describes a different plausible online
  behavior, aesthetic, meme dynamic or social pattern the term could believably mean.
  Never "a marketing term", "a medical term", "a type of fruit/animal/dance" — foreign
  domains are giveaways.
- Fakes must be confidently and specifically wrong, not vague or absurd. A good fake
  reads like a real dictionary entry for a neighboring concept.
- Same tone, same person, same level of jargon across all three options in each language.

THE ILLUSTRATION BRIEF is a separate field, NOT part of the guessing game — it may
describe the term's real meaning as directly and concretely as needed:
- 1-2 sentences, 60-280 characters, in plain descriptive English (regardless of the
  post's language elsewhere).
- Ground it in specific, literally drawable objects, scenes or actions tied to THIS
  term's actual meaning — not a generic "internet vibes" mood board. E.g. for "ratio":
  "A single small social-media post visibly swamped by a flood of reply icons far
  outnumbering its like icons, like a tiny boat overwhelmed by a wave." For "rizz":
  "A magnetic glow radiating from one figure's silhouette while sparks and hearts
  drift toward it from a crowd of onlookers." Be that specific and literal.
- Describe it through objects, symbols, glows, UI-like shapes, or scenery — NOT human
  figures or faces (illustrations must not depict people, so phrase actions through
  objects/symbols standing in for them, e.g. "a spotlight" instead of "a confident person").
- Never instruct that any text, letters, words or numbers appear in the image itself.

Respond with STRICT JSON only (no prose, no code fences) matching exactly:
{
  "term": string,              // canonical spelling
  "pos": string,               // part of speech, e.g. "noun", "verb", "adj., internet"
  "ipa": string,               // IPA, e.g. "/rɪz/"
  "respelled_ru": string,      // Cyrillic respelling for RU readers, e.g. "риз"
  "origin_en": string,         // 2-4 sentences, where it came from
  "origin_ru": string,
  "definition_en": string,     // 1-2 sentences, 120-220 chars, never contains the term
  "definition_ru": string,
  "illustration_brief_en": string, // see THE ILLUSTRATION BRIEF above
  "example_en": string,        // ONE example sentence, as seen in the wild
  "example_note_en": string,   // plain-English explanation of the example
  "example_note_ru": string,   // Russian translation of the example + a note
  "ok_tags_en": string[],      // 2-4 short "ok to use" contexts, e.g. "group chats"
  "ok_tags_ru": string[],
  "not_ok_tags_en": string[],  // 2-4 short "not ok" contexts
  "not_ok_tags_ru": string[],
  "related": string[],         // 2-4 related slang terms (just the terms)
  "fake_definitions_en": [string, string],  // same length/register as definition_en
  "fake_definitions_ru": [string, string]   // same length/register as definition_ru
}`,
    user:
      `Write today's full bilingual entry for the term: "${term}". STRICT JSON only.`,
  };
}

/**
 * Flux prompt: hard-constrained to SFW, no text, no people, no logos.
 *
 * Takes the dedicated `illustration_brief_en` field, not the guessing-game
 * definition: the definition is deliberately vague (readers must not be able
 * to tell it from the fakes) and never restates the term, which starved Flux
 * of anything concrete to draw and produced generic mood-board scenes with no
 * real connection to the term. The brief is free to describe the term's
 * actual meaning directly. It deliberately does NOT include the term itself
 * as a quoted string: flux-1-schnell loves to render quoted words as
 * typography, which is exactly the "no text" defect we validate against.
 * Humans are banned outright too — hands and faces are the model's weakest
 * anatomy at 6 steps, so the composition is steered toward object/symbol
 * scenes instead (the brief-writing instructions already ask for this).
 */
export function imagePrompt(illustrationBrief: string, attempt = 0): string {
  const retryPrefix = attempt > 0
    ? "IMPORTANT: the previous attempt broke the rules below; follow them exactly this time. "
    : "";
  return `${retryPrefix}Editorial concept illustration for an online dictionary ` +
    `of internet slang. Depict this specific scene concretely: ` +
    `${illustrationBrief.slice(0, 300)}. ` +
    `Ironic, witty, slightly surreal editorial illustration style. ` +
    `Dark midnight navy background with violet glow and warm amber accents, ` +
    `glossy magazine feel. ` +
    `Hard rules: no humans, no faces, no hands, no body parts, no real people, ` +
    `no celebrity likeness, absolutely no text, no letters, no words, no numbers, ` +
    `no typography, no captions, no signage, no brand logos, no watermarks, ` +
    `safe for work, no violence.`;
}

/**
 * Vision-model check of the generated illustration: the two anatomy/text
 * defects LLaVA-7B answers reliably, plus a lenient relevance check against
 * the illustration brief. "is_relevant" defaults to true on any loose or
 * metaphorical connection — these are ironic surreal editorial illustrations,
 * not literal photos, so a strict reading would reject good abstract art as
 * often as it catches genuinely unrelated ones.
 */
export function imageValidationPrompt(illustrationBrief: string): string {
  return `Look at the image carefully. Respond with STRICT JSON only, no prose: ` +
    `{"has_text": true/false, "has_humans": true/false, "is_relevant": true/false}. ` +
    `"has_text" is true if the image contains any readable letters, words, ` +
    `numbers or typography. "has_humans" is true if any human figure, face, ` +
    `hand or other body part is visible. "is_relevant" is true if the image ` +
    `has ANY plausible thematic, symbolic or metaphorical connection — even a ` +
    `loose or abstract one — to this concept: "${
      illustrationBrief.slice(0, 250)
    }". ` +
    `Default "is_relevant" to true unless the image is clearly about something ` +
    `completely unrelated.`;
}
