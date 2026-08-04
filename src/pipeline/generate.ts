/** Step 3: one AI call producing the full bilingual entry as strict JSON. */

import { extractJson, runText } from "../ai/gateway.ts";
import { entryPrompt } from "../ai/prompts.ts";

export interface GeneratedEntry {
  term: string;
  pos: string;
  ipa: string;
  respelled_ru: string;
  origin_en: string;
  origin_ru: string;
  definition_en: string;
  definition_ru: string;
  illustration_brief_en: string;
  example_en: string;
  example_note_en: string;
  example_note_ru: string;
  ok_tags_en: string[];
  ok_tags_ru: string[];
  not_ok_tags_en: string[];
  not_ok_tags_ru: string[];
  related: string[];
  fake_definitions_en: [string, string];
  fake_definitions_ru: [string, string];
}

function str(v: unknown, field: string, required = true): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (!required) return "";
  throw new Error(`entry: missing field ${field}`);
}

function strArray(
  v: unknown,
  field: string,
  min: number,
  max: number,
): string[] {
  if (!Array.isArray(v)) throw new Error(`entry: ${field} not an array`);
  const arr = v.filter((x) => typeof x === "string" && x.trim()).map((x) =>
    (x as string).trim()
  );
  if (arr.length < min) throw new Error(`entry: ${field} needs >=${min} items`);
  return arr.slice(0, max);
}

function pair(v: unknown, field: string): [string, string] {
  const arr = strArray(v, field, 2, 2);
  return [arr[0], arr[1]];
}

/** Validate model output. Throws with a descriptive message on bad shape. */
export function parseEntryJson(raw: string): GeneratedEntry {
  const d = extractJson<Record<string, unknown>>(raw);
  return {
    term: str(d.term, "term"),
    pos: str(d.pos, "pos"),
    ipa: str(d.ipa, "ipa", false),
    respelled_ru: str(d.respelled_ru, "respelled_ru", false),
    origin_en: str(d.origin_en, "origin_en"),
    origin_ru: str(d.origin_ru, "origin_ru"),
    definition_en: str(d.definition_en, "definition_en"),
    definition_ru: str(d.definition_ru, "definition_ru"),
    illustration_brief_en: str(
      d.illustration_brief_en,
      "illustration_brief_en",
    ),
    example_en: str(d.example_en, "example_en"),
    example_note_en: str(d.example_note_en, "example_note_en"),
    example_note_ru: str(d.example_note_ru, "example_note_ru"),
    ok_tags_en: strArray(d.ok_tags_en, "ok_tags_en", 1, 4),
    ok_tags_ru: strArray(d.ok_tags_ru, "ok_tags_ru", 1, 4),
    not_ok_tags_en: strArray(d.not_ok_tags_en, "not_ok_tags_en", 1, 4),
    not_ok_tags_ru: strArray(d.not_ok_tags_ru, "not_ok_tags_ru", 1, 4),
    related: strArray(d.related, "related", 0, 4),
    fake_definitions_en: pair(d.fake_definitions_en, "fake_definitions_en"),
    fake_definitions_ru: pair(d.fake_definitions_ru, "fake_definitions_ru"),
  };
}

export async function generateEntry(
  ai: Ai,
  term: string,
): Promise<GeneratedEntry> {
  const { system, user } = entryPrompt(term);
  const raw = await runText(ai, [
    { role: "system", content: system },
    { role: "user", content: user },
  ], 2400);

  let feedback: string;
  try {
    const entry = parseEntryJson(raw);
    const balance = checkGameBalance(entry);
    if (!balance) return entry;
    feedback = balance;
  } catch (parseError) {
    feedback = (parseError as Error).message;
  }

  // One retry for malformed JSON or a giveaway-prone game — still within the
  // <=3 text calls/day budget.
  const retry = await runText(ai, [
    { role: "system", content: system },
    { role: "user", content: user },
    { role: "assistant", content: raw.slice(0, 1000) },
    {
      role: "user",
      content: `Your previous output was invalid (${feedback}). ` +
        `Respond again with STRICT valid JSON only, fixing exactly that.`,
    },
  ], 2400);
  const entry = parseEntryJson(retry);
  const balance = checkGameBalance(entry);
  if (balance) {
    // Accept anyway — a slightly lopsided game beats no issue at all — but
    // leave a trace for the cron log / console.
    console.warn(`game balance still off after retry: ${balance}`);
  }
  return entry;
}

/**
 * Guard against the two giveaways that let readers spot the real definition
 * without knowing the term: length imbalance between the real definition and
 * the fakes, and any of the three options quoting the term itself.
 * Returns a problem description for the retry prompt, or null when balanced.
 * Exported for tests.
 */
export function checkGameBalance(entry: GeneratedEntry): string | null {
  const problems: string[] = [];
  const langs = [
    {
      lang: "en",
      real: entry.definition_en,
      fakes: entry.fake_definitions_en,
    },
    {
      lang: "ru",
      real: entry.definition_ru,
      fakes: entry.fake_definitions_ru,
    },
  ];
  const termNeedle = entry.term.toLowerCase();

  for (const { lang, real, fakes } of langs) {
    for (const text of [real, ...fakes]) {
      if (text.toLowerCase().includes(termNeedle)) {
        problems.push(
          `a ${lang} definition option contains the term itself — rephrase without it`,
        );
        break;
      }
    }
    for (const fake of fakes) {
      const ratio = fake.length / Math.max(real.length, 1);
      if (ratio < 0.55 || ratio > 1.8) {
        problems.push(
          `${lang} fake definitions must be about the same length as the real one ` +
            `(real: ${real.length} chars, fake: ${fake.length} chars)`,
        );
        break;
      }
    }
  }
  return problems.length > 0 ? problems.join("; ") : null;
}
