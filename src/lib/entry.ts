/** Localized entry view-model shared by SSR pages and the guess-game reveal. */

import { parseRelated, parseTags, type TermRow } from "./d1.ts";
import type { Locale } from "./i18n.ts";
import { slugify } from "./slug.ts";

export interface RelatedLink {
  term: string;
  slug: string;
  /** True when the related term is already published in the archive. */
  published: boolean;
}

export interface LocalizedEntry {
  slug: string;
  term: string;
  date: string;
  dayNumber: number;
  pos: string;
  ipa: string;
  respelledRu: string;
  origin: string;
  definition: string;
  example: string;
  exampleNote: string;
  okTags: string[];
  notOkTags: string[];
  related: RelatedLink[];
  imageKey: string | null;
  trendSource: string;
  suggestedByReader: boolean;
}

export function localizeEntry(
  row: TermRow,
  locale: Locale,
  dayNumber: number,
  publishedSlugs: Set<string>,
): LocalizedEntry {
  const ru = locale === "ru";
  return {
    slug: row.slug,
    term: row.term,
    date: row.date,
    dayNumber,
    pos: row.pos,
    ipa: row.ipa,
    respelledRu: row.respelled_ru,
    origin: ru ? row.origin_ru : row.origin_en,
    definition: ru ? row.definition_ru : row.definition_en,
    example: row.example_en,
    exampleNote: ru ? row.example_note_ru : row.example_note_en,
    okTags: parseTags(ru ? row.ok_tags_ru : row.ok_tags_en),
    notOkTags: parseTags(ru ? row.not_ok_tags_ru : row.not_ok_tags_en),
    related: parseRelated(row).map((term) => {
      const slug = slugify(term);
      return { term, slug, published: publishedSlugs.has(slug) };
    }),
    imageKey: row.image_key,
    trendSource: row.trend_source,
    suggestedByReader: row.suggested_by_reader === 1,
  };
}
