/**
 * OG image routes. The Satori/WASM render path (workers-og's ImageResponse)
 * cannot run under `deno test` — it fails to resolve its .wasm module outside
 * the Workers runtime — so these tests cover every branch reachable without
 * hitting the renderer: extension/slug validation and the KV cache-hit path,
 * which is what production traffic serves almost all of the time.
 */
import { assertEquals } from "@std/assert";
import { og } from "../src/routes/og.tsx";
import { KV_KEYS } from "../src/lib/kv.ts";
import { FakeD1, FakeKV, makeEnv, makeTermRow } from "./helpers.ts";

function setup() {
  const db = new FakeD1();
  db.terms.push(makeTermRow());
  const kv = new FakeKV();
  return { db, kv, env: makeEnv(db, kv) };
}

Deno.test("GET /og/term/:file: rejects a non-.png file", async () => {
  const { env } = setup();
  const res = await og.request("http://localhost/og/term/rizz.jpg", {}, env);
  assertEquals(res.status, 404);
});

Deno.test("GET /og/term/:file: 404s for an unpublished slug (cache miss)", async () => {
  const { env } = setup();
  const res = await og.request("http://localhost/og/term/nope.png", {}, env);
  assertEquals(res.status, 404);
});

Deno.test("GET /og/term/:file: serves the cached PNG without re-rendering", async () => {
  const { kv, env } = setup();
  const bytes = new TextEncoder().encode("cached-png-bytes").buffer;
  await kv.put(`${KV_KEYS.ogPrefix}rizz`, bytes);

  const res = await og.request("http://localhost/og/term/rizz.png", {}, env);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/png");
  assertEquals(await res.arrayBuffer(), bytes);
});

Deno.test("GET /og/default.png: serves the cached default PNG without re-rendering", async () => {
  const { kv, env } = setup();
  const bytes = new TextEncoder().encode("cached-default-bytes").buffer;
  await kv.put(`${KV_KEYS.ogPrefix}__default`, bytes);

  const res = await og.request("http://localhost/og/default.png", {}, env);
  assertEquals(res.status, 200);
  assertEquals(await res.arrayBuffer(), bytes);
});
