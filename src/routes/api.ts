/** JSON API: guess, suggest, health. ZERO Workers AI calls in this file. */
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Env } from "../env.ts";
import {
  countSuggestions,
  countUnusedSeedTerms,
  getDayNumber,
  getPublishedSlugsAndTerms,
  getTermBySlug,
  incrementGuess,
  insertSuggestion,
  recentCronLog,
  setSuggestionStatus,
} from "../lib/d1.ts";
import { localizeEntry } from "../lib/entry.ts";
import {
  notifySuggestion,
  parseSuggestionCallback,
  tgCall,
} from "../pipeline/telegram.ts";
import { correctIndex } from "../lib/game.ts";
import { signValue, verifyValue } from "../lib/cookies.ts";
import { verifyTurnstile } from "../lib/turnstile.ts";
import { KV_KEYS } from "../lib/kv.ts";
import type { Locale } from "../lib/i18n.ts";
import { todayUTC } from "../lib/i18n.ts";

export const api = new Hono<{ Bindings: Env }>();

const UID_COOKIE = "slangbot_uid";

/** Get-or-create the signed anonymous visitor id (no PII — a random UUID). */
async function visitorId(
  c: {
    req: { raw: Request };
    env: Env;
    header: (n: string, v: string) => void;
  },
): Promise<string> {
  const secret = c.env.COOKIE_HMAC_SECRET;
  const raw = getCookie(c as never, UID_COOKIE);
  const verified = await verifyValue(raw, secret);
  if (verified) return verified;
  const uid = crypto.randomUUID();
  setCookie(c as never, UID_COOKIE, await signValue(uid, secret), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return uid;
}

api.post("/api/guess", async (c) => {
  let body: { slug?: string; choiceIndex?: number; locale?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "bad request" }, 400);
  }
  const slug = typeof body.slug === "string" ? body.slug.slice(0, 80) : "";
  const choiceIndex = typeof body.choiceIndex === "number"
    ? Math.trunc(body.choiceIndex)
    : NaN;
  const locale: Locale = body.locale === "ru" ? "ru" : "en";
  if (
    !slug || Number.isNaN(choiceIndex) || choiceIndex < -1 || choiceIndex > 2
  ) {
    return c.json({ error: "bad request" }, 400);
  }

  const row = await getTermBySlug(c.env.DB, slug);
  if (!row) return c.json({ error: "unknown term" }, 404);

  const realIndex = await correctIndex(slug, c.env.COOKIE_HMAC_SECRET);
  const reveal = choiceIndex === -1; // "just show me" — never counted
  const correct = !reveal && choiceIndex === realIndex;

  const uid = await visitorId(c);
  const dedupeKey = `${KV_KEYS.guessPrefix}${slug}:${uid}`;
  const alreadyCounted = (await c.env.KV.get(dedupeKey)) !== null;

  let guessRight = row.guess_right;
  let guessTotal = row.guess_total;
  if (!reveal && !alreadyCounted) {
    await incrementGuess(c.env.DB, slug, correct);
    await c.env.KV.put(dedupeKey, correct ? "1" : "0", {
      expirationTtl: 60 * 60 * 24 * 14,
    });
    guessTotal += 1;
    if (correct) guessRight += 1;
  }

  const dayNumber = await getDayNumber(c.env.DB, row.date);
  const slugs = new Set(
    (await getPublishedSlugsAndTerms(c.env.DB)).map((p) => p.slug),
  );
  const entry = localizeEntry(row, locale, dayNumber, slugs);
  const percent = guessTotal > 0
    ? Math.round((guessRight / guessTotal) * 100)
    : 0;

  return c.json({
    correct,
    correctIndex: realIndex,
    percent,
    alreadyCounted,
    entry,
  });
});

api.post("/api/suggest", async (c) => {
  let term = "";
  let token = "";
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await c.req.json()) as {
        term?: string;
        turnstileToken?: string;
      };
      term = typeof body.term === "string" ? body.term : "";
      token = typeof body.turnstileToken === "string"
        ? body.turnstileToken
        : "";
    } catch {
      return c.json({ error: "bad request" }, 400);
    }
  } else {
    // No-JS fallback: full-page form POST.
    const form = await c.req.formData();
    term = String(form.get("term") ?? "");
    token = String(form.get("cf-turnstile-response") ?? "");
  }

  term = term.trim().slice(0, 40);
  if (!term) return c.json({ error: "empty term" }, 400);

  const ip = c.req.header("cf-connecting-ip");
  if (!(await verifyTurnstile(token, c.env.TURNSTILE_SECRET, ip))) {
    return c.json({ error: "turnstile failed" }, 403);
  }

  // Rate limit: 3 suggestions per visitor per UTC day.
  const uid = await visitorId(c);
  const rateKey = `${KV_KEYS.suggestRatePrefix}${uid}:${todayUTC()}`;
  const count = parseInt((await c.env.KV.get(rateKey)) ?? "0", 10);
  if (count >= 3) return c.json({ error: "rate limited" }, 429);
  await c.env.KV.put(rateKey, String(count + 1), {
    expirationTtl: 60 * 60 * 24,
  });

  // Stored as plain text; rendered only through React's default escaping.
  const suggestionId = await insertSuggestion(c.env.DB, term);

  // Moderation notice with approve/reject buttons — best-effort, off the
  // critical path of the visitor's request.
  const notice = notifySuggestion(c.env, term, suggestionId);
  try {
    c.executionCtx.waitUntil(notice);
  } catch {
    // no execution context (tests) — the promise still settles on its own
  }

  if (!contentType.includes("application/json")) {
    return c.redirect(c.req.header("referer") ?? "/", 303);
  }
  return c.json({ ok: true });
});

/**
 * Telegram webhook: receives callback_query updates when the admin presses
 * ✅/❌ under a suggestion notice. Authenticated by the secret token Telegram
 * echoes in a header (set during webhook registration). No AI, no cookies.
 */
api.post("/api/telegram/webhook", async (c) => {
  const secret = c.env.TELEGRAM_WEBHOOK_SECRET;
  if (
    !secret ||
    c.req.header("X-Telegram-Bot-Api-Secret-Token") !== secret
  ) {
    return c.json({ error: "forbidden" }, 403);
  }

  let update: {
    callback_query?: {
      id: string;
      data?: string;
      message?: { chat: { id: number }; message_id: number; text?: string };
    };
  };
  try {
    update = await c.req.json();
  } catch {
    return c.json({ error: "bad request" }, 400);
  }

  const cb = update.callback_query;
  const parsed = parseSuggestionCallback(cb?.data);
  // Always 200 for unknown updates so Telegram does not retry them forever.
  if (!cb || !parsed) return c.json({ ok: true });

  const status = parsed.action === "approve" ? "approved" : "rejected";
  await setSuggestionStatus(c.env.DB, parsed.id, status);

  if (c.env.TELEGRAM_BOT_TOKEN) {
    await tgCall(c.env.TELEGRAM_BOT_TOKEN, "answerCallbackQuery", {
      callback_query_id: cb.id,
      text: status,
    });
    if (cb.message) {
      // Freeze the message: decision appended, buttons removed.
      await tgCall(c.env.TELEGRAM_BOT_TOKEN, "editMessageText", {
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text: `${cb.message.text ?? ""}\n\n${
          status === "approved" ? "✅ approved" : "❌ rejected"
        }`,
      });
    }
  }
  return c.json({ ok: true });
});

api.get("/api/health", async (c) => {
  const today = todayUTC();
  const latest = await c.env.DB
    .prepare("SELECT date, slug FROM terms ORDER BY date DESC LIMIT 1")
    .first<{ date: string; slug: string }>();
  const lastCron = (await recentCronLog(c.env.DB, 1))[0] ?? null;
  return c.json({
    ok: true,
    today,
    lastPublishedDate: latest?.date ?? null,
    lastPublishedSlug: latest?.slug ?? null,
    lastCron,
    seedSupplyRemaining: await countUnusedSeedTerms(c.env.DB),
    suggestionQueue: await countSuggestions(c.env.DB, "new"),
  });
});
