-- Migration number: 0001    iuma initial schema

CREATE TABLE IF NOT EXISTS terms (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  term TEXT NOT NULL,
  date TEXT UNIQUE NOT NULL,
  pos TEXT NOT NULL DEFAULT '',
  ipa TEXT NOT NULL DEFAULT '',
  respelled_ru TEXT NOT NULL DEFAULT '',
  origin_en TEXT NOT NULL DEFAULT '',
  origin_ru TEXT NOT NULL DEFAULT '',
  definition_en TEXT NOT NULL DEFAULT '',
  definition_ru TEXT NOT NULL DEFAULT '',
  example_en TEXT NOT NULL DEFAULT '',
  example_note_en TEXT NOT NULL DEFAULT '',
  example_note_ru TEXT NOT NULL DEFAULT '',
  ok_tags_en TEXT NOT NULL DEFAULT '[]',
  ok_tags_ru TEXT NOT NULL DEFAULT '[]',
  not_ok_tags_en TEXT NOT NULL DEFAULT '[]',
  not_ok_tags_ru TEXT NOT NULL DEFAULT '[]',
  related_json TEXT NOT NULL DEFAULT '[]',
  fake_defs_json TEXT NOT NULL DEFAULT '{"en":[],"ru":[]}',
  image_key TEXT,
  trend_source TEXT NOT NULL DEFAULT '',
  suggested_by_reader INTEGER NOT NULL DEFAULT 0,
  guess_right INTEGER NOT NULL DEFAULT 0,
  guess_total INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_terms_date ON terms(date);

CREATE TABLE IF NOT EXISTS seed_terms (
  term TEXT PRIMARY KEY,
  priority INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY,
  term TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'approved', 'rejected', 'published'))
);

CREATE TABLE IF NOT EXISTS cron_log (
  id INTEGER PRIMARY KEY,
  run_at TEXT NOT NULL DEFAULT (datetime('now')),
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
