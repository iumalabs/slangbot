/** D1 access layer: typed rows and all queries used by routes and pipeline. */

export interface TermRow {
  id: number;
  slug: string;
  term: string;
  date: string;
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
  ok_tags_en: string;
  ok_tags_ru: string;
  not_ok_tags_en: string;
  not_ok_tags_ru: string;
  related_json: string;
  fake_defs_json: string;
  image_key: string | null;
  trend_source: string;
  suggested_by_reader: number;
  guess_right: number;
  guess_total: number;
  created_at: string;
}

export interface FakeDefs {
  en: [string, string];
  ru: [string, string];
}

export interface SuggestionRow {
  id: number;
  term: string;
  created_at: string;
  status: "new" | "approved" | "rejected" | "published";
}

export interface CronLogRow {
  id: number;
  run_at: string;
  step: string;
  status: string;
  detail: string;
}

export function parseFakeDefs(row: TermRow): FakeDefs {
  try {
    const parsed = JSON.parse(row.fake_defs_json) as Partial<FakeDefs>;
    return {
      en: [parsed.en?.[0] ?? "", parsed.en?.[1] ?? ""],
      ru: [parsed.ru?.[0] ?? "", parsed.ru?.[1] ?? ""],
    };
  } catch {
    return { en: ["", ""], ru: ["", ""] };
  }
}

export function parseRelated(row: TermRow): string[] {
  try {
    const parsed = JSON.parse(row.related_json);
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function parseTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export async function getTermByDate(
  db: D1Database,
  date: string,
): Promise<TermRow | null> {
  return await db.prepare("SELECT * FROM terms WHERE date = ?").bind(date)
    .first<TermRow>();
}

export async function getTermBySlug(
  db: D1Database,
  slug: string,
): Promise<TermRow | null> {
  return await db.prepare("SELECT * FROM terms WHERE slug = ?").bind(slug)
    .first<TermRow>();
}

/** Latest published term with date <= today (today's issue). */
export async function getLatestTerm(
  db: D1Database,
  today: string,
): Promise<TermRow | null> {
  return await db
    .prepare("SELECT * FROM terms WHERE date <= ? ORDER BY date DESC LIMIT 1")
    .bind(today)
    .first<TermRow>();
}

/** 1-based issue number of a term (position in the date-ordered archive). */
export async function getDayNumber(
  db: D1Database,
  date: string,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM terms WHERE date <= ?")
    .bind(date)
    .first<{ n: number }>();
  return row?.n ?? 1;
}

export async function listTerms(
  db: D1Database,
  opts: { search?: string; limit?: number } = {},
): Promise<TermRow[]> {
  const limit = Math.min(opts.limit ?? 500, 500);
  if (opts.search) {
    const like = `%${opts.search.replace(/[%_]/g, "")}%`;
    const res = await db
      .prepare(
        `SELECT * FROM terms
         WHERE term LIKE ?1 OR definition_en LIKE ?1 OR definition_ru LIKE ?1
         ORDER BY date DESC LIMIT ?2`,
      )
      .bind(like, limit)
      .all<TermRow>();
    return res.results;
  }
  const res = await db
    .prepare("SELECT * FROM terms ORDER BY date DESC LIMIT ?")
    .bind(limit)
    .all<TermRow>();
  return res.results;
}

export async function getPublishedSlugsAndTerms(
  db: D1Database,
): Promise<{ slug: string; term: string }[]> {
  const res = await db.prepare("SELECT slug, term FROM terms").all<{
    slug: string;
    term: string;
  }>();
  return res.results;
}

export async function incrementGuess(
  db: D1Database,
  slug: string,
  correct: boolean,
): Promise<void> {
  await db
    .prepare(
      "UPDATE terms SET guess_total = guess_total + 1, guess_right = guess_right + ? WHERE slug = ?",
    )
    .bind(correct ? 1 : 0, slug)
    .run();
}

export interface NewTerm {
  slug: string;
  term: string;
  date: string;
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
  fake_defs: FakeDefs;
  image_key: string | null;
  trend_source: string;
  suggested_by_reader: boolean;
}

/** Idempotent publish: re-running the pipeline for a date replaces the entry. */
export async function upsertTermByDate(
  db: D1Database,
  t: NewTerm,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO terms (
        slug, term, date, pos, ipa, respelled_ru, origin_en, origin_ru,
        definition_en, definition_ru, example_en, example_note_en, example_note_ru,
        ok_tags_en, ok_tags_ru, not_ok_tags_en, not_ok_tags_ru,
        related_json, fake_defs_json, image_key, trend_source, suggested_by_reader,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(date) DO UPDATE SET
        slug = excluded.slug, term = excluded.term, pos = excluded.pos,
        ipa = excluded.ipa, respelled_ru = excluded.respelled_ru,
        origin_en = excluded.origin_en, origin_ru = excluded.origin_ru,
        definition_en = excluded.definition_en, definition_ru = excluded.definition_ru,
        example_en = excluded.example_en, example_note_en = excluded.example_note_en,
        example_note_ru = excluded.example_note_ru,
        ok_tags_en = excluded.ok_tags_en, ok_tags_ru = excluded.ok_tags_ru,
        not_ok_tags_en = excluded.not_ok_tags_en, not_ok_tags_ru = excluded.not_ok_tags_ru,
        related_json = excluded.related_json, fake_defs_json = excluded.fake_defs_json,
        image_key = excluded.image_key, trend_source = excluded.trend_source,
        suggested_by_reader = excluded.suggested_by_reader`,
    )
    .bind(
      t.slug,
      t.term,
      t.date,
      t.pos,
      t.ipa,
      t.respelled_ru,
      t.origin_en,
      t.origin_ru,
      t.definition_en,
      t.definition_ru,
      t.example_en,
      t.example_note_en,
      t.example_note_ru,
      JSON.stringify(t.ok_tags_en),
      JSON.stringify(t.ok_tags_ru),
      JSON.stringify(t.not_ok_tags_en),
      JSON.stringify(t.not_ok_tags_ru),
      JSON.stringify(t.related),
      JSON.stringify(t.fake_defs),
      t.image_key,
      t.trend_source,
      t.suggested_by_reader ? 1 : 0,
    )
    .run();
}

export async function setImageKey(
  db: D1Database,
  slug: string,
  imageKey: string | null,
): Promise<void> {
  await db.prepare("UPDATE terms SET image_key = ? WHERE slug = ?").bind(
    imageKey,
    slug,
  ).run();
}

// --- seed_terms ---

export async function getUnusedSeedTerms(
  db: D1Database,
  limit = 30,
): Promise<string[]> {
  const res = await db
    .prepare(
      "SELECT term FROM seed_terms WHERE used = 0 ORDER BY priority DESC LIMIT ?",
    )
    .bind(limit)
    .all<{ term: string }>();
  return res.results.map((r) => r.term);
}

export async function countUnusedSeedTerms(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM seed_terms WHERE used = 0")
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function markSeedTermUsed(
  db: D1Database,
  term: string,
): Promise<void> {
  await db.prepare(
    "UPDATE seed_terms SET used = 1 WHERE lower(term) = lower(?)",
  ).bind(term).run();
}

export async function addSeedTerm(
  db: D1Database,
  term: string,
  priority = 0,
): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO seed_terms (term, priority) VALUES (?, ?)")
    .bind(term, priority)
    .run();
}

// --- suggestions ---

export async function insertSuggestion(
  db: D1Database,
  term: string,
): Promise<void> {
  await db
    .prepare("INSERT INTO suggestions (term, status) VALUES (?, 'new')")
    .bind(term)
    .run();
}

export async function listSuggestions(
  db: D1Database,
  status?: string,
): Promise<SuggestionRow[]> {
  const res = status
    ? await db
      .prepare(
        "SELECT * FROM suggestions WHERE status = ? ORDER BY id DESC LIMIT 200",
      )
      .bind(status)
      .all<SuggestionRow>()
    : await db.prepare("SELECT * FROM suggestions ORDER BY id DESC LIMIT 200")
      .all<SuggestionRow>();
  return res.results;
}

export async function getApprovedSuggestions(
  db: D1Database,
): Promise<SuggestionRow[]> {
  return await listSuggestions(db, "approved");
}

export async function setSuggestionStatus(
  db: D1Database,
  id: number,
  status: SuggestionRow["status"],
): Promise<void> {
  await db.prepare("UPDATE suggestions SET status = ? WHERE id = ?").bind(
    status,
    id,
  ).run();
}

export async function markSuggestionPublished(
  db: D1Database,
  term: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE suggestions SET status = 'published' WHERE lower(term) = lower(?) AND status = 'approved'",
    )
    .bind(term)
    .run();
}

export async function countSuggestions(
  db: D1Database,
  status: string,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM suggestions WHERE status = ?")
    .bind(status)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// --- cron_log ---

export async function logCron(
  db: D1Database,
  step: string,
  status: "ok" | "error" | "skip",
  detail = "",
): Promise<void> {
  await db
    .prepare("INSERT INTO cron_log (step, status, detail) VALUES (?, ?, ?)")
    .bind(step, status, detail.slice(0, 2000))
    .run();
}

export async function recentCronLog(
  db: D1Database,
  limit = 50,
): Promise<CronLogRow[]> {
  const res = await db
    .prepare("SELECT * FROM cron_log ORDER BY id DESC LIMIT ?")
    .bind(limit)
    .all<CronLogRow>();
  return res.results;
}
