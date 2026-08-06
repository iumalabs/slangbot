/**
 * Route-level tests with fake bindings: guess endpoint semantics, suggestion
 * rate limiting, and the no-answer-leak guarantee for game-mode SSR.
 */
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { api } from "../src/routes/api.ts";
import { pages, render404 } from "../src/routes/pages.tsx";
import { correctIndex } from "../src/lib/game.ts";
import {
  FakeD1,
  FakeKV,
  makeEnv,
  makeTermRow,
  TEST_SECRET,
} from "./helpers.ts";

function setup() {
  const db = new FakeD1();
  db.terms.push(makeTermRow());
  const kv = new FakeKV();
  return { db, kv, env: makeEnv(db, kv) };
}

function guessReq(body: unknown, cookie?: string): Request {
  return new Request("http://localhost/api/guess", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

Deno.test("guess: correct answer counts once and reveals the entry", async () => {
  const { db, env } = setup();
  const right = await correctIndex("rizz", TEST_SECRET);

  const res = await api.request(
    guessReq({ slug: "rizz", choiceIndex: right }),
    {},
    env,
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.correct, true);
  assertEquals(data.correctIndex, right);
  assertEquals(data.entry.slug, "rizz");
  assert(data.entry.definition.includes("REAL-DEFINITION-EN"));
  assertEquals(db.terms[0].guess_total, 81);
  assertEquals(db.terms[0].guess_right, 21);
  assertEquals(data.percent, Math.round((21 / 81) * 100));
});

Deno.test("guess: wrong answer counts as wrong", async () => {
  const { db, env } = setup();
  const right = await correctIndex("rizz", TEST_SECRET);
  const wrong = (right + 1) % 3;

  const res = await api.request(
    guessReq({ slug: "rizz", choiceIndex: wrong }),
    {},
    env,
  );
  const data = await res.json();
  assertEquals(data.correct, false);
  assertEquals(db.terms[0].guess_total, 81);
  assertEquals(db.terms[0].guess_right, 20);
});

Deno.test("guess: repeat guesses by the same visitor are not recounted", async () => {
  const { db, env } = setup();
  const right = await correctIndex("rizz", TEST_SECRET);

  const first = await api.request(
    guessReq({ slug: "rizz", choiceIndex: right }),
    {},
    env,
  );
  const cookie = first.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert(cookie.startsWith("slangbot_uid="));

  const second = await api.request(
    guessReq({ slug: "rizz", choiceIndex: right }, cookie),
    {},
    env,
  );
  const data = await second.json();
  assertEquals(data.alreadyCounted, true);
  assertEquals(db.terms[0].guess_total, 81); // still one count
});

Deno.test("guess: unknown slug is 404, malformed input is 400", async () => {
  const { env } = setup();
  const notFound = await api.request(
    guessReq({ slug: "nope", choiceIndex: 0 }),
    {},
    env,
  );
  assertEquals(notFound.status, 404);
  const bad = await api.request(
    guessReq({ slug: "rizz", choiceIndex: 7 }),
    {},
    env,
  );
  assertEquals(bad.status, 400);
});

Deno.test("guess: unparseable JSON body is 400", async () => {
  const { env } = setup();
  const res = await api.request(
    new Request("http://localhost/api/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    }),
    {},
    env,
  );
  assertEquals(res.status, 400);
});

Deno.test("guess: reveal (-1) returns the entry without counting", async () => {
  const { db, env } = setup();
  const res = await api.request(
    guessReq({ slug: "rizz", choiceIndex: -1 }),
    {},
    env,
  );
  const data = await res.json();
  assertEquals(data.correct, false);
  assertEquals(data.entry.slug, "rizz");
  assertEquals(db.terms[0].guess_total, 80); // unchanged
});

Deno.test("game-mode SSR never leaks which choice is correct", async () => {
  const { env } = setup();
  const res = await pages.request("http://localhost/", {}, env);
  assertEquals(res.status, 200);
  const html = await res.text();

  // All three candidate texts are present (that is the game)...
  assertStringIncludes(html, "REAL-DEFINITION-EN");
  assertStringIncludes(html, "FAKE-ONE-EN");
  // ...but nothing marks which one is real:
  assert(!html.includes("correctIndex"), "correctIndex leaked into HTML");
  assert(!html.includes("is-real"), "resolved-state class leaked into HTML");
  assert(!html.includes("fake_defs"), "raw fake_defs leaked into HTML");
  assert(!html.includes(TEST_SECRET), "secret leaked into HTML");

  // The GuessGame hydration payload carries only safe keys.
  const m = html.match(/data-island="GuessGame" data-props="([^"]+)"/);
  assert(m, "GuessGame island not found");
  const props = JSON.parse(m[1].replaceAll("&quot;", '"'));
  assertEquals(
    Object.keys(props).sort(),
    ["choices", "date", "locale", "permalink", "slug"],
  );
});

Deno.test("home page: shows a placeholder before the first entry is published", async () => {
  const db = new FakeD1(); // no terms seeded
  const kv = new FakeKV();
  const env = makeEnv(db, kv);
  const res = await pages.request("http://localhost/", {}, env);
  assertEquals(res.status, 200);
  assert(!(await res.text()).includes('data-island="GuessGame"'));
});

Deno.test("RU home page renders Russian choices at /ru/", async () => {
  const { env } = setup();
  const res = await pages.request("http://localhost/ru/", {}, env);
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "REAL-DEFINITION-RU");
  assertStringIncludes(html, 'lang="ru"');
});

Deno.test("term permalink reveals the full entry", async () => {
  const { env } = setup();
  const res = await pages.request("http://localhost/term/rizz", {}, env);
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "REAL-DEFINITION-EN");
  assertStringIncludes(html, "unspoken rizz");
  const missing = await pages.request("http://localhost/term/nope", {}, env);
  assertEquals(missing.status, 404);
});

Deno.test("RU term permalink reveals the full entry in Russian", async () => {
  const { env } = setup();
  const res = await pages.request("http://localhost/ru/term/rizz", {}, env);
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "REAL-DEFINITION-RU");
  assertStringIncludes(html, 'lang="ru"');
  const missing = await pages.request(
    "http://localhost/ru/term/nope",
    {},
    env,
  );
  assertEquals(missing.status, 404);
});

Deno.test("GET /ru redirects to /ru/", async () => {
  const { env } = setup();
  const res = await pages.request(
    new Request("http://localhost/ru", { redirect: "manual" }),
    {},
    env,
  );
  assertEquals(res.status, 301);
  assertEquals(res.headers.get("location"), "/ru/");
});

Deno.test("archive: lists terms and supports search", async () => {
  const { env } = setup();
  const all = await pages.request("http://localhost/archive", {}, env);
  assertEquals(all.status, 200);
  assertStringIncludes(await all.text(), "rizz");

  const hit = await pages.request(
    "http://localhost/archive?q=rizz",
    {},
    env,
  );
  assertEquals(hit.status, 200);
  assertStringIncludes(await hit.text(), "rizz");

  const miss = await pages.request(
    "http://localhost/archive?q=zzzznotaterm",
    {},
    env,
  );
  assertEquals(miss.status, 200);
  assert(!(await miss.text()).includes(">rizz<"));
});

Deno.test("RU archive: lists terms in Russian", async () => {
  const { env } = setup();
  const res = await pages.request("http://localhost/ru/archive", {}, env);
  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), 'lang="ru"');
});

Deno.test("render404: renders a localized 404 page", async () => {
  const en = await render404("en", "/nope");
  assertEquals(en.status, 404);
  assertStringIncludes(await en.text(), "404");

  const ru = await render404("ru", "/ru/nope");
  assertEquals(ru.status, 404);
  assertStringIncludes(await ru.text(), 'lang="ru"');
});

Deno.test("suggest: rate limit allows 3 per day then 429", async () => {
  const { db, env } = setup();

  // Stub Turnstile verification (network call) to always succeed.
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname === "challenges.cloudflare.com") {
      return Promise.resolve(Response.json({ success: true }));
    }
    return realFetch(input, init);
  }) as typeof fetch;

  try {
    const post = (cookie?: string) =>
      api.request(
        new Request("http://localhost/api/suggest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: JSON.stringify({ term: "skibidi", turnstileToken: "tok" }),
        }),
        {},
        env,
      );

    const first = await post();
    assertEquals(first.status, 200);
    const cookie = first.headers.get("set-cookie")?.split(";")[0] ?? "";

    assertEquals((await post(cookie)).status, 200);
    assertEquals((await post(cookie)).status, 200);
    assertEquals((await post(cookie)).status, 429);
    assertEquals(db.suggestions.length, 3);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("suggest: overlong terms are truncated to 40 chars", async () => {
  const { db, env } = setup();
  const realFetch = globalThis.fetch;
  globalThis.fetch =
    (() => Promise.resolve(Response.json({ success: true }))) as typeof fetch;
  try {
    const res = await api.request(
      new Request("http://localhost/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: "x".repeat(100), turnstileToken: "tok" }),
      }),
      {},
      env,
    );
    assertEquals(res.status, 200);
    assertEquals(db.suggestions[0].term.length, 40);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("suggest: unparseable JSON body is 400", async () => {
  const { env } = setup();
  const res = await api.request(
    new Request("http://localhost/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    }),
    {},
    env,
  );
  assertEquals(res.status, 400);
});

Deno.test("suggest: failed Turnstile verification is 403", async () => {
  const { db, env } = setup();
  const realFetch = globalThis.fetch;
  globalThis.fetch =
    (() => Promise.resolve(Response.json({ success: false }))) as typeof fetch;
  try {
    const res = await api.request(
      new Request("http://localhost/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: "skibidi", turnstileToken: "tok" }),
      }),
      {},
      env,
    );
    assertEquals(res.status, 403);
    assertEquals(db.suggestions.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("suggest: no-JS form POST redirects back to the referring page", async () => {
  const { db, env } = setup();
  const realFetch = globalThis.fetch;
  globalThis.fetch =
    (() => Promise.resolve(Response.json({ success: true }))) as typeof fetch;
  try {
    const form = new URLSearchParams({
      term: "skibidi",
      "cf-turnstile-response": "tok",
    });
    const res = await api.request(
      new Request("http://localhost/api/suggest", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": "http://localhost/",
        },
        body: form.toString(),
        redirect: "manual",
      }),
      {},
      env,
    );
    assertEquals(res.status, 303);
    assertEquals(res.headers.get("location"), "http://localhost/");
    assertEquals(db.suggestions[0].term, "skibidi");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("telegram webhook: unparseable JSON body is 400", async () => {
  const { env } = setup();
  const envWithHook = { ...env, TELEGRAM_WEBHOOK_SECRET: "hook-secret" };
  const res = await api.request(
    new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": "hook-secret",
      },
      body: "not json",
    }),
    {},
    envWithHook,
  );
  assertEquals(res.status, 400);
});

Deno.test("telegram webhook: with a bot token configured, acks and edits the source message", async () => {
  const { db, env } = setup();
  db.suggestions.push({
    id: 2,
    term: "rizzler",
    status: "new",
    created_at: "now",
  });
  const envWithBot = {
    ...env,
    TELEGRAM_WEBHOOK_SECRET: "hook-secret",
    TELEGRAM_BOT_TOKEN: "bot-token",
  };
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    calls.push(url.pathname);
    return Promise.resolve(Response.json({ ok: true }));
  }) as typeof fetch;

  try {
    const res = await api.request(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "hook-secret",
        },
        body: JSON.stringify({
          callback_query: {
            id: "cb2",
            data: "sug:approve:2",
            message: { chat: { id: 1 }, message_id: 5, text: "rizzler?" },
          },
        }),
      }),
      {},
      envWithBot,
    );
    assertEquals(res.status, 200);
    assertEquals(db.suggestions[0].status, "approved");
    assert(calls.some((p) => p.includes("answerCallbackQuery")));
    assert(calls.some((p) => p.includes("editMessageText")));
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("telegram webhook: rejects wrong secret, applies moderation", async () => {
  const { db, env } = setup();
  db.suggestions.push({
    id: 1,
    term: "skibidi",
    status: "new",
    created_at: "now",
  });
  const envWithHook = {
    ...env,
    TELEGRAM_WEBHOOK_SECRET: "hook-secret",
  };

  const post = (secret: string | null, body: unknown) =>
    api.request(
      new Request("http://localhost/api/telegram/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { "X-Telegram-Bot-Api-Secret-Token": secret } : {}),
        },
        body: JSON.stringify(body),
      }),
      {},
      envWithHook,
    );

  // Wrong/absent secret → 403, nothing changes.
  assertEquals((await post(null, {})).status, 403);
  assertEquals((await post("nope", {})).status, 403);

  // Approve button press updates the suggestion.
  const approve = await post("hook-secret", {
    callback_query: { id: "cb1", data: "sug:approve:1" },
  });
  assertEquals(approve.status, 200);
  assertEquals(db.suggestions[0].status, "approved");

  // Unknown callback data is acknowledged without side effects.
  const noop = await post("hook-secret", {
    callback_query: { id: "cb2", data: "unrelated" },
  });
  assertEquals(noop.status, 200);
  assertEquals(db.suggestions[0].status, "approved");
});

Deno.test("health endpoint reports pipeline state", async () => {
  const { env } = setup();
  const res = await api.request("http://localhost/api/health", {}, env);
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.ok, true);
  assertEquals(data.lastPublishedSlug, "rizz");
  assertEquals(data.seedSupplyRemaining, 42);
});
