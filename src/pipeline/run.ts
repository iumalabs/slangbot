/** Daily pipeline orchestration. Idempotent per date; every step logged. */

import type { Env } from "../env.ts";
import { CANONICAL_ORIGIN, SITE_NAME } from "../config.ts";
import {
  addSeedTerm,
  getDayNumber,
  getPublishedSlugsAndTerms,
  getTermByDate,
  logCron,
  markSeedTermUsed,
  markSuggestionPublished,
  setImageKey,
  upsertTermByDate,
} from "../lib/d1.ts";
import { getBlocklist } from "../lib/kv.ts";
import { choiceOrder } from "../lib/game.ts";
import { slugify, uniqueSlug } from "../lib/slug.ts";
import { todayUTC } from "../lib/i18n.ts";
import { harvestCandidates } from "./harvest.ts";
import { pickTerm } from "./pick.ts";
import { generateEntry } from "./generate.ts";
import { illustrate } from "./illustrate.ts";
import { buildTelegramPosts, sendTelegramPosts } from "./telegram.ts";

export interface RunOptions {
  date?: string;
  /** Re-run even if an entry already exists for the date. */
  force?: boolean;
  /** Only regenerate the illustration for the existing entry. */
  imageOnly?: boolean;
}

export async function runDailyPipeline(
  env: Env,
  opts: RunOptions = {},
): Promise<string> {
  const date = opts.date ?? todayUTC();
  const db = env.DB;

  const existing = await getTermByDate(db, date);

  if (opts.imageOnly) {
    if (!existing) return `no entry for ${date}`;
    try {
      const { key, note } = await illustrate(
        env.AI,
        env.IMAGES,
        existing.slug,
        existing.term,
        existing.definition_en,
      );
      await setImageKey(db, existing.slug, key);
      await logCron(db, "illustrate", "ok", `regenerated ${key} (${note})`);
      return `illustration regenerated for ${existing.slug}`;
    } catch (e) {
      await logCron(db, "illustrate", "error", String(e));
      throw e;
    }
  }

  if (existing && !opts.force) {
    await logCron(
      db,
      "pipeline",
      "skip",
      `entry for ${date} already exists (${existing.slug})`,
    );
    return `already published for ${date}: ${existing.slug}`;
  }

  // 1. Harvest
  let candidates;
  try {
    candidates = await harvestCandidates(env);
    await logCron(db, "harvest", "ok", `${candidates.length} candidates`);
  } catch (e) {
    await logCron(db, "harvest", "error", String(e));
    throw e;
  }

  // 2. Pick & dedupe (1 AI call)
  const published = await getPublishedSlugsAndTerms(db);
  const blocklist = await getBlocklist(env.KV);
  let pick;
  try {
    pick = await pickTerm(env.AI, candidates, published, blocklist);
    await logCron(db, "pick", "ok", `${pick.term} (${pick.source})`);
  } catch (e) {
    await logCron(db, "pick", "error", String(e));
    throw e;
  }

  // 3. Generate entry (1 AI call, +1 retry max)
  let entry;
  try {
    entry = await generateEntry(env.AI, pick.term);
    await logCron(db, "generate", "ok", entry.term);
  } catch (e) {
    await logCron(db, "generate", "error", String(e));
    throw e;
  }

  const taken = new Set(published.map((p) => p.slug));
  if (existing) taken.delete(existing.slug); // re-run for same date may keep its slug
  const slug = uniqueSlug(slugify(entry.term), taken);

  const wasSuggested = pick.source === "reader suggestion";

  await upsertTermByDate(db, {
    slug,
    term: entry.term,
    date,
    pos: entry.pos,
    ipa: entry.ipa,
    respelled_ru: entry.respelled_ru,
    origin_en: entry.origin_en,
    origin_ru: entry.origin_ru,
    definition_en: entry.definition_en,
    definition_ru: entry.definition_ru,
    example_en: entry.example_en,
    example_note_en: entry.example_note_en,
    example_note_ru: entry.example_note_ru,
    ok_tags_en: entry.ok_tags_en,
    ok_tags_ru: entry.ok_tags_ru,
    not_ok_tags_en: entry.not_ok_tags_en,
    not_ok_tags_ru: entry.not_ok_tags_ru,
    related: entry.related,
    fake_defs: { en: entry.fake_definitions_en, ru: entry.fake_definitions_ru },
    image_key: existing?.image_key ?? null,
    trend_source: pick.source,
    suggested_by_reader: wasSuggested,
  });
  await logCron(db, "publish", "ok", `${slug} for ${date}`);

  // Bookkeeping: consume seed/suggestion; grow the seed list with related terms.
  await markSeedTermUsed(db, pick.term);
  if (wasSuggested) await markSuggestionPublished(db, pick.term);
  const publishedSlugSet = new Set(published.map((p) => p.slug));
  for (const rel of entry.related) {
    if (!publishedSlugSet.has(slugify(rel))) await addSeedTerm(db, rel, 10);
  }

  // 4. Illustrate (1-2 image calls + vision check). Failure is non-fatal —
  // the entry ships anyway.
  let imageKey: string | null = existing?.image_key ?? null;
  try {
    const { key, note } = await illustrate(
      env.AI,
      env.IMAGES,
      slug,
      entry.term,
      entry.definition_en,
    );
    await setImageKey(db, slug, key);
    imageKey = key;
    await logCron(db, "illustrate", "ok", `${key} (${note})`);
  } catch (e) {
    await logCron(db, "illustrate", "error", `publishing without image: ${e}`);
  }

  // 5. Optional Telegram autopost (feature flag, plain Bot API fetch, no AI):
  // illustration + the A/B/C definitions + a native quiz poll. Skipped on
  // forced re-runs for an already-published date so the channel is never
  // spammed twice with the same day.
  if (
    !existing &&
    env.TELEGRAM_ENABLED === "true" && env.TELEGRAM_BOT_TOKEN &&
    env.TELEGRAM_CHANNEL_ID
  ) {
    try {
      // Same shuffle as the site: display order derives from HMAC(slug).
      const order = await choiceOrder(slug, env.COOKIE_HMAC_SECRET);
      const defs = [
        entry.definition_en,
        entry.fake_definitions_en[0],
        entry.fake_definitions_en[1],
      ];
      const posts = buildTelegramPosts({
        channelId: env.TELEGRAM_CHANNEL_ID,
        siteName: SITE_NAME,
        dayNumber: await getDayNumber(db, date),
        term: entry.term,
        ipa: entry.ipa,
        pos: entry.pos,
        choices: [defs[order[0]], defs[order[1]], defs[order[2]]],
        correctIndex: order.indexOf(0),
        permalink: `${CANONICAL_ORIGIN}/term/${slug}`,
        imageUrl: imageKey ? `${CANONICAL_ORIGIN}/img/${imageKey}` : null,
      });
      const summary = await sendTelegramPosts(env.TELEGRAM_BOT_TOKEN, posts);
      await logCron(db, "telegram", "ok", summary);
    } catch (e) {
      await logCron(db, "telegram", "error", String(e));
    }
  }

  // Bust the cached OG image for this slug in case of a forced re-run.
  await env.KV.delete(`og:${slug}`);

  return `published ${slug} for ${date}`;
}
