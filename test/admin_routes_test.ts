/**
 * Admin route tests: Access JWT is enforced on every /admin/* request, and
 * the manual-trigger endpoints respond with JSON for scripted callers
 * (curl from a WARP-connected machine) when asked for it.
 */
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { admin } from "../src/routes/admin.tsx";
import { base64UrlEncode } from "../src/lib/cookies.ts";
import { FakeD1, FakeKV, makeEnv, makeTermRow } from "./helpers.ts";

const encoder = new TextEncoder();
const NOW = Math.floor(Date.now() / 1000);

async function makeKeyPair() {
  return await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
}

async function makeJwt(
  key: CryptoKeyPair,
  claims: Record<string, unknown>,
): Promise<string> {
  const header = base64UrlEncode(
    encoder.encode(JSON.stringify({ alg: "RS256", kid: "kid-1" })),
  );
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key.privateKey,
    encoder.encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64UrlEncode(sig)}`;
}

async function setup() {
  const db = new FakeD1();
  db.terms.push(makeTermRow());
  const kv = new FakeKV();
  const env = makeEnv(db, kv);

  // Pre-seed the Access certs cache so verification never hits the network.
  const pair = await makeKeyPair();
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  await kv.put(
    "access:certs",
    JSON.stringify({
      keys: [{ kid: "kid-1", kty: jwk.kty, n: jwk.n, e: jwk.e }],
    }),
  );
  const validToken = await makeJwt(pair, {
    aud: [env.ADMIN_ACCESS_AUD],
    exp: NOW + 600,
  });

  return { db, kv, env, validToken };
}

Deno.test("admin: missing JWT is rejected on the dashboard and on POST actions", async () => {
  const { env } = await setup();
  const dashboard = await admin.request("http://localhost/admin", {}, env);
  assertEquals(dashboard.status, 403);

  const run = await admin.request(
    new Request("http://localhost/admin/run", { method: "POST" }),
    {},
    env,
  );
  assertEquals(run.status, 403);
});

Deno.test("admin: a spoofed JWT header is rejected", async () => {
  const { env } = await setup();
  const res = await admin.request(
    "http://localhost/admin",
    { headers: { "Cf-Access-Jwt-Assertion": "not.a.valid.jwt" } },
    env,
  );
  assertEquals(res.status, 403);
});

Deno.test("admin: valid JWT reaches the dashboard", async () => {
  const { env, validToken } = await setup();
  const res = await admin.request(
    "http://localhost/admin",
    { headers: { "Cf-Access-Jwt-Assertion": validToken } },
    env,
  );
  assertEquals(res.status, 200);
});

Deno.test("admin: dashboard renders the suggestion queue and cron log rows", async () => {
  const { db, env, validToken } = await setup();
  db.suggestions.push({
    id: 9,
    term: "skibidi",
    status: "new",
    created_at: "2026-08-01T00:00:00Z",
  });
  db.cronLog.push(
    {
      id: 1,
      run_at: "2026-08-01T00:00:00Z",
      step: "publish",
      status: "ok",
      detail: "rizz for 2026-08-01",
    },
    {
      id: 2,
      run_at: "2026-08-02T00:00:00Z",
      step: "harvest",
      status: "error",
      detail: "boom",
    },
  );
  const res = await admin.request(
    "http://localhost/admin",
    { headers: { "Cf-Access-Jwt-Assertion": validToken } },
    env,
  );
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "skibidi");
  assertStringIncludes(html, "publish");
  assertStringIncludes(html, "log-error");
});

Deno.test("admin/run: JSON callers get a JSON response (scripted curl)", async () => {
  const { env, validToken } = await setup();

  // Harvest hits real trend-source URLs; stub fetch so this test stays fast
  // and offline. The fake AI binding always throws afterwards (pipeline
  // calls are expected from admin actions, unlike user-facing routes), so
  // this exercises the failure branch — what matters here is that the
  // response is well-formed JSON, not the pipeline outcome.
  const realFetch = globalThis.fetch;
  globalThis.fetch =
    (() => Promise.resolve(new Response("", { status: 404 }))) as typeof fetch;

  let res: Response;
  try {
    res = await admin.request(
      new Request("http://localhost/admin/run", {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": validToken,
          "Accept": "application/json",
        },
      }),
      {},
      env,
    );
  } finally {
    globalThis.fetch = realFetch;
  }

  const data = await res.json();
  assertEquals(typeof data.ok, "boolean");
  assertEquals(data.ok, false);
  assert(typeof data.error === "string" && data.error.length > 0);
});

Deno.test("admin/regenerate: bad date returns JSON error for machine callers", async () => {
  const { env, validToken } = await setup();
  const res = await admin.request(
    new Request("http://localhost/admin/regenerate", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": validToken,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "date=not-a-date",
    }),
    {},
    env,
  );
  assertEquals(res.status, 400);
  const data = await res.json();
  assertEquals(data, { ok: false, error: "bad date" });
});

Deno.test("admin/regenerate: bad date returns plain text for browser callers", async () => {
  const { env, validToken } = await setup();
  const res = await admin.request(
    new Request("http://localhost/admin/regenerate", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": validToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "date=not-a-date",
    }),
    {},
    env,
  );
  assertEquals(res.status, 400);
  assertEquals(await res.text(), "bad date");
});

Deno.test("admin/run: browser callers (no Accept: json) still get HTML", async () => {
  const { env, validToken } = await setup();
  const realFetch = globalThis.fetch;
  globalThis.fetch =
    (() => Promise.resolve(new Response("", { status: 404 }))) as typeof fetch;
  let res: Response;
  try {
    res = await admin.request(
      new Request("http://localhost/admin/run", {
        method: "POST",
        headers: { "Cf-Access-Jwt-Assertion": validToken },
      }),
      {},
      env,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assert(res.headers.get("content-type")?.includes("text/html"));
});

Deno.test("admin/regenerate: imageOnly with no entry for the date succeeds without touching AI", async () => {
  const { env, validToken } = await setup();
  const res = await admin.request(
    new Request("http://localhost/admin/regenerate", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": validToken,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "date=2099-01-01&imageOnly=1",
    }),
    {},
    env,
  );
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data, { ok: true, message: "no entry for 2099-01-01" });
});

Deno.test("admin/regenerate: browser callers (no Accept: json) get an HTML success page", async () => {
  const { env, validToken } = await setup();
  const res = await admin.request(
    new Request("http://localhost/admin/regenerate", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": validToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "date=2099-01-01&imageOnly=1",
    }),
    {},
    env,
  );
  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "no entry for 2099-01-01");
});

Deno.test("admin/regenerate: pipeline failure (AI unreachable) surfaces as a 500 JSON error", async () => {
  const { env, validToken } = await setup();
  const realFetch = globalThis.fetch;
  globalThis.fetch =
    (() => Promise.resolve(new Response("", { status: 404 }))) as typeof fetch;
  let res: Response;
  try {
    res = await admin.request(
      new Request("http://localhost/admin/regenerate", {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": validToken,
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "date=2099-02-02",
      }),
      {},
      env,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(res.status, 500);
  const data = await res.json();
  assertEquals(data.ok, false);
});

Deno.test("admin/regenerate: browser callers get an HTML failure page on pipeline failure", async () => {
  const { env, validToken } = await setup();
  const realFetch = globalThis.fetch;
  globalThis.fetch =
    (() => Promise.resolve(new Response("", { status: 404 }))) as typeof fetch;
  let res: Response;
  try {
    res = await admin.request(
      new Request("http://localhost/admin/regenerate", {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": validToken,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "date=2099-03-03",
      }),
      {},
      env,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(res.status, 500);
  assertStringIncludes(await res.text(), "failed:");
});

Deno.test("admin/telegram: no published term yet is a 404", async () => {
  const { db, env, validToken } = await setup();
  db.terms.length = 0; // no term for today
  const res = await admin.request(
    new Request("http://localhost/admin/telegram", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": validToken,
        "Accept": "application/json",
      },
    }),
    {},
    env,
  );
  assertEquals(res.status, 404);
  const data = await res.json();
  assertEquals(data, { ok: false, error: "no term yet" });
});

Deno.test("admin/telegram: browser callers get a plain-text 404 when nothing is published", async () => {
  const { db, env, validToken } = await setup();
  db.terms.length = 0;
  const res = await admin.request(
    new Request("http://localhost/admin/telegram", {
      method: "POST",
      headers: { "Cf-Access-Jwt-Assertion": validToken },
    }),
    {},
    env,
  );
  assertEquals(res.status, 404);
  assertStringIncludes(await res.text(), "no published term yet");
});

Deno.test("admin/telegram: missing bot secrets surfaces as a 500 error and is logged", async () => {
  const { db, env, validToken } = await setup();
  const res = await admin.request(
    new Request("http://localhost/admin/telegram", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": validToken,
        "Accept": "application/json",
      },
    }),
    {},
    env,
  );
  assertEquals(res.status, 500);
  const data = await res.json();
  assertEquals(data.ok, false);
  assertEquals(db.cronLog.at(-1)?.step, "telegram");
  assertEquals(db.cronLog.at(-1)?.status, "error");
});

Deno.test("admin/telegram: browser callers get an HTML failure page on missing bot secrets", async () => {
  const { env, validToken } = await setup();
  const res = await admin.request(
    new Request("http://localhost/admin/telegram", {
      method: "POST",
      headers: { "Cf-Access-Jwt-Assertion": validToken },
    }),
    {},
    env,
  );
  assertEquals(res.status, 500);
  assertStringIncludes(await res.text(), "failed:");
});

Deno.test("admin/telegram: posts today's word when secrets are configured", async () => {
  const { db, env, validToken } = await setup();
  const envWithTelegram = {
    ...env,
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_CHANNEL_ID: "-100123",
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname === "api.telegram.org") {
      return Promise.resolve(Response.json({ ok: true }));
    }
    return realFetch(input);
  }) as typeof fetch;

  let res: Response;
  try {
    res = await admin.request(
      new Request("http://localhost/admin/telegram", {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": validToken,
          "Accept": "application/json",
        },
      }),
      {},
      envWithTelegram,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.ok, true);
  assertEquals(db.cronLog.at(-1)?.step, "telegram");
  assertEquals(db.cronLog.at(-1)?.status, "ok");
});

Deno.test("admin/telegram: browser callers get an HTML success page", async () => {
  const { env, validToken } = await setup();
  const envWithTelegram = {
    ...env,
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_CHANNEL_ID: "-100123",
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname === "api.telegram.org") {
      return Promise.resolve(Response.json({ ok: true }));
    }
    return realFetch(input);
  }) as typeof fetch;

  let res: Response;
  try {
    res = await admin.request(
      new Request("http://localhost/admin/telegram", {
        method: "POST",
        headers: { "Cf-Access-Jwt-Assertion": validToken },
      }),
      {},
      envWithTelegram,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "posted &quot;");
  assertStringIncludes(html, "to Telegram");
  assertStringIncludes(html, "sendMessage");
});

Deno.test("admin/telegram-webhook: missing secrets is a 500 error", async () => {
  const { env, validToken } = await setup();
  const res = await admin.request(
    new Request("http://localhost/admin/telegram-webhook", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": validToken,
        "Accept": "application/json",
      },
    }),
    {},
    env,
  );
  assertEquals(res.status, 500);
  const data = await res.json();
  assertEquals(data.ok, false);
});

Deno.test("admin/telegram-webhook: browser callers get an HTML failure page on missing secrets", async () => {
  const { env, validToken } = await setup();
  const res = await admin.request(
    new Request("http://localhost/admin/telegram-webhook", {
      method: "POST",
      headers: { "Cf-Access-Jwt-Assertion": validToken },
    }),
    {},
    env,
  );
  assertEquals(res.status, 500);
  assertStringIncludes(
    await res.text(),
    "TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET",
  );
});

Deno.test("admin/telegram-webhook: registers the webhook when secrets are configured", async () => {
  const { env, validToken } = await setup();
  const envWithTelegram = {
    ...env,
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET: "hook-secret",
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname === "api.telegram.org") {
      return Promise.resolve(Response.json({ ok: true }));
    }
    return realFetch(input);
  }) as typeof fetch;

  let res: Response;
  try {
    res = await admin.request(
      new Request("http://localhost/admin/telegram-webhook", {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": validToken,
          "Accept": "application/json",
        },
      }),
      {},
      envWithTelegram,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.ok, true);
});

Deno.test("admin/telegram-webhook: browser callers get an HTML success page", async () => {
  const { env, validToken } = await setup();
  const envWithTelegram = {
    ...env,
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET: "hook-secret",
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname === "api.telegram.org") {
      return Promise.resolve(Response.json({ ok: true }));
    }
    return realFetch(input);
  }) as typeof fetch;

  let res: Response;
  try {
    res = await admin.request(
      new Request("http://localhost/admin/telegram-webhook", {
        method: "POST",
        headers: { "Cf-Access-Jwt-Assertion": validToken },
      }),
      {},
      envWithTelegram,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "setWebhook:");
});

Deno.test("admin/suggestion: approves/rejects and redirects back to the dashboard", async () => {
  const { db, env, validToken } = await setup();
  db.suggestions.push({
    id: 7,
    term: "skibidi",
    status: "new",
    created_at: "now",
  });
  const res = await admin.request(
    new Request("http://localhost/admin/suggestion", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": validToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "id=7&action=approved",
      redirect: "manual",
    }),
    {},
    env,
  );
  assertEquals(res.status, 303);
  assertEquals(res.headers.get("location"), "/admin");
  assertEquals(db.suggestions[0].status, "approved");
});

Deno.test("admin/suggestion: rejects malformed input with 400", async () => {
  const { env, validToken } = await setup();
  const res = await admin.request(
    new Request("http://localhost/admin/suggestion", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": validToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "id=notanumber&action=approved",
    }),
    {},
    env,
  );
  assertEquals(res.status, 400);
});

Deno.test("admin/blocklist: saves the submitted list and redirects", async () => {
  const { kv, env, validToken } = await setup();
  const res = await admin.request(
    new Request("http://localhost/admin/blocklist", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": validToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "blocklist=" + encodeURIComponent("slur\nnazi"),
      redirect: "manual",
    }),
    {},
    env,
  );
  assertEquals(res.status, 303);
  assertEquals(await kv.get("config:blocklist"), "slur\nnazi");
});

Deno.test("admin/sources: saves valid JSON and redirects", async () => {
  const { kv, env, validToken } = await setup();
  const sources = JSON.stringify([{ type: "urban", url: "https://x.test" }]);
  const res = await admin.request(
    new Request("http://localhost/admin/sources", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": validToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "sources=" + encodeURIComponent(sources),
      redirect: "manual",
    }),
    {},
    env,
  );
  assertEquals(res.status, 303);
  assertEquals(await kv.get("config:sources"), sources);
});

Deno.test("admin/sources: falls back to defaults when the JSON parses but isn't an array", async () => {
  const { kv, env, validToken } = await setup();
  const res = await admin.request(
    new Request("http://localhost/admin/sources", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": validToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "sources=" +
        encodeURIComponent(JSON.stringify({ not: "an array" })),
      redirect: "manual",
    }),
    {},
    env,
  );
  assertEquals(res.status, 303);
  const saved = JSON.parse(await kv.get("config:sources") as string);
  assert(Array.isArray(saved) && saved.length > 0);
});

Deno.test("admin/sources: falls back to defaults on malformed JSON", async () => {
  const { kv, env, validToken } = await setup();
  const res = await admin.request(
    new Request("http://localhost/admin/sources", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": validToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "sources=" + encodeURIComponent("not json"),
      redirect: "manual",
    }),
    {},
    env,
  );
  assertEquals(res.status, 303);
  const saved = JSON.parse(await kv.get("config:sources") as string);
  assert(Array.isArray(saved) && saved.length > 0);
});
