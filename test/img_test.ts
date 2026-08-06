/** /img/* serves R2 illustrations, restricted to pipeline-written keys. */
import { assertEquals } from "@std/assert";
import { img } from "../src/routes/img.ts";
import { FakeD1, FakeKV, FakeR2, makeEnv } from "./helpers.ts";

function setup() {
  const db = new FakeD1();
  const kv = new FakeKV();
  const images = new FakeR2();
  const env = makeEnv(db, kv, { IMAGES: images as unknown as R2Bucket });
  return { images, env };
}

Deno.test("GET /img/*: serves a stored illustration with immutable cache headers", async () => {
  const { images, env } = setup();
  const bytes = new TextEncoder().encode("fake-png-bytes").buffer;
  await images.put("terms/rizz.png", bytes, {
    httpMetadata: { contentType: "image/png" },
  });

  const res = await img.request("http://localhost/img/terms/rizz.png", {}, env);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/png");
  assertEquals(
    res.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  assertEquals(await res.arrayBuffer(), bytes);
});

Deno.test("GET /img/*: rejects keys outside the terms/<slug>.png pattern", async () => {
  const { images, env } = setup();
  // Even if something were stored at a non-conforming key, the route must
  // never serve it — only "terms/<slug>.png" is allowed through.
  await images.put(
    "config/secrets.txt",
    new TextEncoder().encode("nope").buffer,
  );
  const res = await img.request(
    "http://localhost/img/config/secrets.txt",
    {},
    env,
  );
  assertEquals(res.status, 404);
});

Deno.test("GET /img/*: 404s when the object isn't in R2", async () => {
  const { env } = setup();
  const res = await img.request(
    "http://localhost/img/terms/missing.png",
    {},
    env,
  );
  assertEquals(res.status, 404);
});
