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

function strArray(v: unknown, field: string, min: number, max: number): string[] {
  if (!Array.isArray(v)) throw new Error(`entry: ${field} not an array`);
  const arr = v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim());
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

export async function generateEntry(ai: Ai, term: string): Promise<GeneratedEntry> {
  const { system, user } = entryPrompt(term);
  const raw = await runText(ai, [
    { role: "system", content: system },
    { role: "user", content: user },
  ], 2400);
  try {
    return parseEntryJson(raw);
  } catch (firstError) {
    // One retry for malformed JSON — still within the <=3 text calls/day budget.
    const retry = await runText(ai, [
      { role: "system", content: system },
      { role: "user", content: user },
      { role: "assistant", content: raw.slice(0, 1000) },
      {
        role: "user",
        content:
          `Your previous output was invalid (${(firstError as Error).message}). ` +
          `Respond again with STRICT valid JSON only.`,
      },
    ], 2400);
    return parseEntryJson(retry);
  }
}
