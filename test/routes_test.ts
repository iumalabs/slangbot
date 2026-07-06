/**
 * Route-level tests with fake bindings: guess endpoint semantics, suggestion
 * rate limiting, and the no-answer-leak guarantee for game-mode SSR.
 */
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { api } from "../src/routes/api.ts";
import { pages } from "../src/routes/pages.tsx";
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
  assert(cookie.startsWith("iuma_uid="));

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

Deno.test("suggest: rate limit allows 3 per day then 429", async () => {
  const { db, env } = setup();

  // Stub Turnstile verification (network call) to always succeed.
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("challenges.cloudflare.com")) {
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

Deno.test("health endpoint reports pipeline state", async () => {
  const { env } = setup();
  const res = await api.request("http://localhost/api/health", {}, env);
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.ok, true);
  assertEquals(data.lastPublishedSlug, "rizz");
  assertEquals(data.seedSupplyRemaining, 42);
});
