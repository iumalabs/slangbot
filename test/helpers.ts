/** In-memory fakes for the D1/KV bindings used by route tests. */

import type { Env } from "../src/env.ts";
import type { TermRow } from "../src/lib/d1.ts";

export const TEST_SECRET = "test-secret-for-hmac";

export function makeTermRow(overrides: Partial<TermRow> = {}): TermRow {
  return {
    id: 1,
    slug: "rizz",
    term: "rizz",
    // Always "today or earlier" so getLatestTerm picks it up in tests.
    date: "2020-01-01",
    pos: "noun",
    ipa: "/rɪz/",
    respelled_ru: "риз",
    origin_en: "Clipped from charisma.",
    origin_ru: "Усечение слова charisma.",
    definition_en: "REAL-DEFINITION-EN effortless charm.",
    definition_ru: "REAL-DEFINITION-RU природное обаяние.",
    example_en: "unspoken rizz",
    example_note_en: "note en",
    example_note_ru: "note ru",
    ok_tags_en: '["chats"]',
    ok_tags_ru: '["чаты"]',
    not_ok_tags_en: '["interviews"]',
    not_ok_tags_ru: '["собеседования"]',
    related_json: '["gyat","sigma"]',
    fake_defs_json: JSON.stringify({
      en: ["FAKE-ONE-EN believable.", "FAKE-TWO-EN plausible."],
      ru: ["FAKE-ONE-RU правдоподобное.", "FAKE-TWO-RU похожее."],
    }),
    image_key: null,
    trend_source: "seed",
    suggested_by_reader: 0,
    guess_right: 20,
    guess_total: 80,
    created_at: "2026-07-07T00:00:00Z",
    ...overrides,
  };
}

/** Fake D1 that answers just the SQL shapes the app issues. */
export class FakeD1 {
  terms: TermRow[] = [];
  suggestions: {
    id: number;
    term: string;
    status: string;
    created_at: string;
  }[] = [];
  cronLog: {
    id: number;
    run_at: string;
    step: string;
    status: string;
    detail: string;
  }[] = [];

  prepare(query: string) {
    const q = query.replace(/\s+/g, " ").trim();
    // deno-lint-ignore no-this-alias
    const db = this;
    let bound: unknown[] = [];
    const stmt = {
      bind(...values: unknown[]) {
        bound = values;
        return stmt;
      },
      first<T>(): Promise<T | null> {
        return Promise.resolve(db.#firstFor(q, bound) as T | null);
      },
      all<T>(): Promise<
        { results: T[]; success: boolean; meta: Record<string, unknown> }
      > {
        return Promise.resolve({
          results: db.#allFor(q, bound) as T[],
          success: true,
          meta: {},
        });
      },
      run(): Promise<
        { results: never[]; success: boolean; meta: Record<string, unknown> }
      > {
        const meta = db.#runFor(q, bound) ?? {};
        return Promise.resolve({ results: [], success: true, meta });
      },
    };
    return stmt;
  }

  #firstFor(q: string, bound: unknown[]): unknown {
    if (q.startsWith("SELECT * FROM terms WHERE slug = ?")) {
      return this.terms.find((t) => t.slug === bound[0]) ?? null;
    }
    if (q.startsWith("SELECT * FROM terms WHERE date = ?")) {
      return this.terms.find((t) => t.date === bound[0]) ?? null;
    }
    if (q.startsWith("SELECT * FROM terms WHERE date <= ?")) {
      const sorted = [...this.terms].filter((t) => t.date <= String(bound[0]))
        .sort((a, b) => b.date.localeCompare(a.date));
      return sorted[0] ?? null;
    }
    if (q.startsWith("SELECT COUNT(*) AS n FROM terms WHERE date <= ?")) {
      return { n: this.terms.filter((t) => t.date <= String(bound[0])).length };
    }
    if (q.startsWith("SELECT COUNT(*) AS n FROM seed_terms")) return { n: 42 };
    if (q.startsWith("SELECT COUNT(*) AS n FROM suggestions")) {
      return {
        n: this.suggestions.filter((s) => s.status === bound[0]).length,
      };
    }
    if (q.startsWith("SELECT date, slug FROM terms")) {
      const sorted = [...this.terms].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      return sorted[0] ? { date: sorted[0].date, slug: sorted[0].slug } : null;
    }
    throw new Error(`FakeD1.first: unhandled query: ${q}`);
  }

  #allFor(q: string, bound: unknown[]): unknown[] {
    if (q.startsWith("SELECT slug, term FROM terms")) {
      return this.terms.map((t) => ({ slug: t.slug, term: t.term }));
    }
    if (q.startsWith("SELECT * FROM terms ORDER BY date DESC")) {
      return [...this.terms].sort((a, b) => b.date.localeCompare(a.date));
    }
    if (q.includes("FROM terms WHERE term LIKE")) {
      const like = String(bound[0]).replaceAll("%", "").toLowerCase();
      return this.terms.filter((t) =>
        t.term.toLowerCase().includes(like) ||
        t.definition_en.toLowerCase().includes(like) ||
        t.definition_ru.toLowerCase().includes(like)
      );
    }
    if (q.includes("FROM suggestions")) {
      return bound.length
        ? this.suggestions.filter((s) => s.status === bound[0])
        : this.suggestions;
    }
    if (q.includes("FROM cron_log")) return this.cronLog;
    if (q.startsWith("SELECT term FROM seed_terms")) return [];
    throw new Error(`FakeD1.all: unhandled query: ${q}`);
  }

  #runFor(q: string, bound: unknown[]): Record<string, unknown> | undefined {
    if (q.startsWith("UPDATE terms SET guess_total")) {
      const t = this.terms.find((t) => t.slug === bound[1]);
      if (t) {
        t.guess_total += 1;
        t.guess_right += Number(bound[0]);
      }
      return;
    }
    if (q.startsWith("INSERT INTO suggestions")) {
      const id = this.suggestions.length + 1;
      this.suggestions.push({
        id,
        term: String(bound[0]),
        status: "new",
        created_at: new Date().toISOString(),
      });
      return { last_row_id: id };
    }
    if (q.startsWith("UPDATE suggestions SET status")) {
      const s = this.suggestions.find((s) => s.id === Number(bound[1]));
      if (s) s.status = String(bound[0]);
      return;
    }
    if (q.startsWith("INSERT INTO cron_log")) {
      this.cronLog.push({
        id: this.cronLog.length + 1,
        run_at: new Date().toISOString(),
        step: String(bound[0]),
        status: String(bound[1]),
        detail: String(bound[2]),
      });
      return;
    }
    // updates to seed_terms / suggestions status etc. — accepted, ignored
  }

  batch(): Promise<never[]> {
    return Promise.resolve([]);
  }
}

export class FakeKV {
  store = new Map<string, string | ArrayBuffer>();

  get(key: string, type?: string): Promise<string | ArrayBuffer | null> {
    const v = this.store.get(key) ?? null;
    if (v === null) return Promise.resolve(null);
    if (type === "arrayBuffer") {
      return Promise.resolve(
        v instanceof ArrayBuffer
          ? v
          : new TextEncoder().encode(String(v)).buffer,
      );
    }
    return Promise.resolve(typeof v === "string" ? v : null);
  }
  put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
  ): Promise<void> {
    this.store.set(key, value as string | ArrayBuffer);
    return Promise.resolve();
  }
  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }
  list(): Promise<{ keys: { name: string }[]; list_complete: boolean }> {
    return Promise.resolve({
      keys: [...this.store.keys()].map((name) => ({ name })),
      list_complete: true,
    });
  }
}

export function makeEnv(db: FakeD1, kv: FakeKV): Env {
  return {
    AI: {
      run() {
        throw new Error(
          "Workers AI must never be called from user-facing paths",
        );
      },
    } as unknown as Ai,
    DB: db as unknown as D1Database,
    KV: kv as unknown as KVNamespace,
    IMAGES: {} as R2Bucket,
    TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
    COOKIE_HMAC_SECRET: TEST_SECRET,
    ADMIN_ACCESS_AUD: "test-aud",
  };
}
