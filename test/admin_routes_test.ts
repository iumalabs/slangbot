/**
 * Admin route tests: Access JWT is enforced on every /admin/* request, and
 * the manual-trigger endpoints respond with JSON for scripted callers
 * (curl from a WARP-connected machine) when asked for it.
 */
import { assert, assertEquals } from "@std/assert";
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
