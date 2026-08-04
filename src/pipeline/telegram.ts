/**
 * Step 5 (feature-flagged): post the daily word to the Telegram channel as a
 * playable guess game — an illustration, the three definitions labeled
 * A/B/C, and a native quiz poll where subscribers vote and instantly see
 * whether they were right.
 *
 * Telegram limits poll option text to 100 chars, far shorter than a real
 * definition — hence the standard split: a message carries the full A/B/C
 * texts, the quiz poll options are just the letters.
 *
 * Plain Bot API fetches; no AI involved.
 */

import type { Env } from "../env.ts";
import type { TermRow } from "../lib/d1.ts";
import { parseFakeDefs } from "../lib/d1.ts";
import { choiceOrder } from "../lib/game.ts";
import { type Locale, localePath } from "../lib/i18n.ts";
import { t } from "../content/i18n.ts";
import { CANONICAL_ORIGIN, SITE_NAME } from "../config.ts";

const CHOICE_LABELS = ["A", "B", "C"] as const;

export interface TelegramPost {
  method: string;
  payload: Record<string, unknown>;
}

export interface DailyPostInput {
  channelId: string;
  siteName: string;
  dayNumber: number;
  /** Language of the post scaffolding and (by the caller) the definitions. */
  locale: Locale;
  term: string;
  ipa: string;
  pos: string;
  /** Shuffled definitions in display order (same order as the site). */
  choices: readonly [string, string, string];
  /** Display index of the real definition. */
  correctIndex: number;
  permalink: string;
  /**
   * Whether an illustration exists for this term — only affects the message
   * wording (the header moves into the photo's caption). The photo itself is
   * sent separately as raw bytes, not built here — see `sendPhotoBytes`.
   */
  hasImage: boolean;
}

/**
 * Caption used on the photo message when an illustration is sent — exported
 * so postTermToTelegram can reuse it for the multipart upload.
 */
export function telegramHeader(
  locale: Locale,
  siteName: string,
  dayNumber: number,
  term: string,
  ipa: string,
  pos: string,
): string {
  const ui = t(locale);
  return `📖 ${siteName} — ${ui.tickerDay} ${dayNumber}\n\n${term}\n${ipa} · ${pos}`;
}

/** Pure builder — exported for tests. */
export function buildTelegramPosts(input: DailyPostInput): TelegramPost[] {
  const ui = t(input.locale);
  const posts: TelegramPost[] = [];
  const header = telegramHeader(
    input.locale,
    input.siteName,
    input.dayNumber,
    input.term,
    input.ipa,
    input.pos,
  );

  const options = input.choices
    .map((text, i) => `${CHOICE_LABELS[i]}) ${text}`)
    .join("\n\n");
  posts.push({
    method: "sendMessage",
    payload: {
      chat_id: input.channelId,
      text: `${input.hasImage ? input.term : header}\n\n` +
        `${ui.tgIntro}\n\n${options}\n\n` +
        `${ui.tgVote}\n${input.permalink}`,
      link_preview_options: { is_disabled: true },
    },
  });

  posts.push({
    method: "sendPoll",
    payload: {
      chat_id: input.channelId,
      question: ui.tgWhichReal(input.term).slice(0, 300),
      options: [...CHOICE_LABELS],
      type: "quiz",
      correct_option_id: input.correctIndex,
      is_anonymous: true,
      explanation: `${ui.tgFullEntry} ${input.permalink}`.slice(0, 200),
    },
  });

  return posts;
}

/**
 * Post a published term to the channel. Shared by the daily pipeline and the
 * admin "post to Telegram" button. Throws if the secrets are missing —
 * callers decide whether that is fatal.
 *
 * The photo is uploaded as raw bytes straight from R2 (multipart), not as a
 * URL for Telegram to fetch: Telegram's own fetcher reaching our domain
 * turned out to be flaky (edge/WAF-dependent — a plain curl to the same URL
 * succeeds every time from outside, yet `sendPhoto` with a `photo` URL
 * failed daily with "failed to get HTTP URL content" after the domain move).
 * Uploading bytes directly removes that whole class of failure.
 */
export async function postTermToTelegram(
  env: Env,
  row: TermRow,
  dayNumber: number,
): Promise<string> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID secrets are not configured",
    );
  }
  // Post language: TELEGRAM_LOCALE var ("en" | "ru", default en). The entry
  // is bilingual in D1, so this is purely a presentation switch.
  const locale: Locale = env.TELEGRAM_LOCALE === "ru" ? "ru" : "en";
  const fakes = parseFakeDefs(row);
  const defs = locale === "ru"
    ? [row.definition_ru, fakes.ru[0], fakes.ru[1]]
    : [row.definition_en, fakes.en[0], fakes.en[1]];
  const ipa = locale === "ru" && row.respelled_ru
    ? `${row.ipa} · ${row.respelled_ru}`
    : row.ipa;
  // Same shuffle as the site: display order derives from HMAC(slug).
  const order = await choiceOrder(row.slug, env.COOKIE_HMAC_SECRET);

  let photoResult: string | null = null;
  if (row.image_key) {
    const obj = await env.IMAGES.get(row.image_key);
    if (obj) {
      const bytes = new Uint8Array(await obj.arrayBuffer());
      const caption = telegramHeader(
        locale,
        SITE_NAME,
        dayNumber,
        row.term,
        ipa,
        row.pos,
      );
      photoResult = await sendPhotoBytes(
        env.TELEGRAM_BOT_TOKEN,
        env.TELEGRAM_CHANNEL_ID,
        bytes,
        `${row.slug}.png`,
        caption,
      );
    } else {
      photoResult = `skipped: R2 object "${row.image_key}" not found`;
    }
  }

  const posts = buildTelegramPosts({
    channelId: env.TELEGRAM_CHANNEL_ID,
    siteName: SITE_NAME,
    dayNumber,
    locale,
    term: row.term,
    ipa,
    pos: row.pos,
    choices: [defs[order[0]], defs[order[1]], defs[order[2]]],
    correctIndex: order.indexOf(0),
    permalink: `${CANONICAL_ORIGIN}${localePath(locale, `/term/${row.slug}`)}`,
    hasImage: photoResult !== null,
  });
  const rest = await sendTelegramPosts(env.TELEGRAM_BOT_TOKEN, posts);
  return photoResult ? `sendPhoto: ${photoResult}; ${rest}` : rest;
}

/**
 * Upload a photo directly (multipart/form-data) instead of asking Telegram
 * to fetch a URL — see postTermToTelegram for why. Returns "200" or
 * "status + error body" for logging, matching tgCall's convention.
 */
export async function sendPhotoBytes(
  botToken: string,
  chatId: string,
  bytes: Uint8Array,
  filename: string,
  caption: string,
): Promise<string> {
  const form = new FormData();
  form.set("chat_id", chatId);
  form.set("caption", caption);
  form.set(
    "photo",
    new Blob([bytes as BlobPart], { type: "image/png" }),
    filename,
  );
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendPhoto`,
    { method: "POST", body: form },
  );
  if (res.ok) return String(res.status);
  return `${res.status} ${(await res.text()).slice(0, 120)}`;
}

/** Single Bot API call; returns "200" or "status + error body" for logging. */
export async function tgCall(
  botToken: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (res.ok) return String(res.status);
  return `${res.status} ${(await res.text()).slice(0, 120)}`;
}

// --- suggestion moderation (DM/notification chat with inline buttons) ---

/** callback_data for the approve/reject buttons, e.g. "sug:approve:42". */
export function suggestionCallbackData(
  action: "approve" | "reject",
  id: number,
): string {
  return `sug:${action}:${id}`;
}

/** Parse callback_data; null when it is not a suggestion callback. */
export function parseSuggestionCallback(
  data: unknown,
): { action: "approve" | "reject"; id: number } | null {
  if (typeof data !== "string") return null;
  const m = data.match(/^sug:(approve|reject):(\d{1,10})$/);
  if (!m) return null;
  return { action: m[1] as "approve" | "reject", id: parseInt(m[2], 10) };
}

/** Moderation notice with inline ✅/❌ buttons. Pure builder — tested. */
export function buildSuggestionNotice(
  adminChatId: string,
  term: string,
  suggestionId: number,
): TelegramPost {
  return {
    method: "sendMessage",
    payload: {
      chat_id: adminChatId,
      text: `💡 new word suggestion:\n\n«${term}»`,
      reply_markup: {
        inline_keyboard: [[
          {
            text: "✅ approve",
            callback_data: suggestionCallbackData("approve", suggestionId),
          },
          {
            text: "❌ reject",
            callback_data: suggestionCallbackData("reject", suggestionId),
          },
        ]],
      },
    },
  };
}

/**
 * Fire-and-forget notice about a fresh suggestion. Silently does nothing
 * when the admin chat is not configured; never throws — a Telegram hiccup
 * must not affect the visitor's request.
 */
export async function notifySuggestion(
  env: Env,
  term: string,
  suggestionId: number,
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ADMIN_CHAT_ID) return;
  try {
    const post = buildSuggestionNotice(
      env.TELEGRAM_ADMIN_CHAT_ID,
      term,
      suggestionId,
    );
    await tgCall(env.TELEGRAM_BOT_TOKEN, post.method, post.payload);
  } catch {
    // notification is best-effort
  }
}

/** Sends the posts in order; returns a per-call status summary. */
export async function sendTelegramPosts(
  botToken: string,
  posts: TelegramPost[],
): Promise<string> {
  const results: string[] = [];
  for (const post of posts) {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/${post.method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(post.payload),
      },
    );
    let detail = String(res.status);
    if (!res.ok) {
      const body = (await res.text()).slice(0, 120);
      detail += ` ${body}`;
    }
    results.push(`${post.method}: ${detail}`);
  }
  return results.join("; ");
}
