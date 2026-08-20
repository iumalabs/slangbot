/** Feed routes: RSS (both locales) and the sitemap. */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { feeds } from "../src/routes/feeds.ts";
import { FakeD1, FakeKV, makeEnv, makeTermRow } from "./helpers.ts";

function setup() {
  const db = new FakeD1();
  db.terms.push(makeTermRow());
  const kv = new FakeKV();
  return { db, kv, env: makeEnv(db, kv) };
}

Deno.test("GET /rss.xml lists published terms in English", async () => {
  const { env } = setup();
  const res = await feeds.request("http://localhost/rss.xml", {}, env);
  assertEquals(res.status, 200);
  assertStringIncludes(
    res.headers.get("content-type") ?? "",
    "application/xml",
  );
  const xml = await res.text();
  assertStringIncludes(xml, '<rss version="2.0">');
  assertStringIncludes(xml, "REAL-DEFINITION-EN");
  assertStringIncludes(xml, "/term/rizz");
});

Deno.test("GET /ru/rss.xml lists published terms in Russian", async () => {
  const { env } = setup();
  const res = await feeds.request("http://localhost/ru/rss.xml", {}, env);
  assertEquals(res.status, 200);
  const xml = await res.text();
  assertStringIncludes(xml, "REAL-DEFINITION-RU");
  assertStringIncludes(xml, "<language>ru</language>");
});

Deno.test("GET /sitemap.xml lists static paths and every term in both locales", async () => {
  const { env } = setup();
  const res = await feeds.request("http://localhost/sitemap.xml", {}, env);
  assertEquals(res.status, 200);
  const xml = await res.text();
  assertStringIncludes(xml, "<urlset");
  assertStringIncludes(xml, "/term/rizz");
  assertStringIncludes(xml, "/ru/term/rizz");
  assertStringIncludes(xml, "/archive");
});
