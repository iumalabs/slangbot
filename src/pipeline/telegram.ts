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
  term: string;
  ipa: string;
  pos: string;
  /** Shuffled definitions in display order (same order as the site). */
  choices: readonly [string, string, string];
  /** Display index of the real definition. */
  correctIndex: number;
  permalink: string;
  imageUrl: string | null;
}

/** Pure builder — exported for tests. */
export function buildTelegramPosts(input: DailyPostInput): TelegramPost[] {
  const posts: TelegramPost[] = [];
  const header =
    `📖 ${input.siteName} — day ${input.dayNumber}\n\n${input.term}\n` +
    `${input.ipa} · ${input.pos}`;

  if (input.imageUrl) {
    posts.push({
      method: "sendPhoto",
      payload: {
        chat_id: input.channelId,
        photo: input.imageUrl,
        caption: header,
      },
    });
  }

  const options = input.choices
    .map((text, i) => `${CHOICE_LABELS[i]}) ${text}`)
    .join("\n\n");
  posts.push({
    method: "sendMessage",
    payload: {
      chat_id: input.channelId,
      text: `${input.imageUrl ? input.term : header}\n\n` +
        `one of these is the real definition:\n\n${options}\n\n` +
        `vote below 👇 then read the full entry:\n${input.permalink}`,
      link_preview_options: { is_disabled: true },
    },
  });

  posts.push({
    method: "sendPoll",
    payload: {
      chat_id: input.channelId,
      question: `${input.term} — which definition is real?`.slice(0, 300),
      options: [...CHOICE_LABELS],
      type: "quiz",
      correct_option_id: input.correctIndex,
      is_anonymous: true,
      explanation: `full entry → ${input.permalink}`.slice(0, 200),
    },
  });

  return posts;
}

/**
 * Post a published term to the channel. Shared by the daily pipeline and the
 * admin "post to Telegram" button. Throws if the secrets are missing —
 * callers decide whether that is fatal.
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
  const fakes = parseFakeDefs(row);
  const defs = [row.definition_en, fakes.en[0], fakes.en[1]];
  // Same shuffle as the site: display order derives from HMAC(slug).
  const order = await choiceOrder(row.slug, env.COOKIE_HMAC_SECRET);
  const posts = buildTelegramPosts({
    channelId: env.TELEGRAM_CHANNEL_ID,
    siteName: SITE_NAME,
    dayNumber,
    term: row.term,
    ipa: row.ipa,
    pos: row.pos,
    choices: [defs[order[0]], defs[order[1]], defs[order[2]]],
    correctIndex: order.indexOf(0),
    permalink: `${CANONICAL_ORIGIN}/term/${row.slug}`,
    imageUrl: row.image_key ? `${CANONICAL_ORIGIN}/img/${row.image_key}` : null,
  });
  return await sendTelegramPosts(env.TELEGRAM_BOT_TOKEN, posts);
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
