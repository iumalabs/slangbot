/** Serve R2 illustrations with immutable cache headers. */
import { Hono } from "hono";
import type { Env } from "../env.ts";

export const img = new Hono<{ Bindings: Env }>();

img.get("/img/*", async (c) => {
  const key = c.req.path.slice("/img/".length);
  // Only ever serve pipeline-written keys.
  if (!/^terms\/[a-z0-9-]+\.png$/.test(key)) return c.notFound();
  const obj = await c.env.IMAGES.get(key);
  if (!obj) return c.notFound();
  const headers = new Headers({
    "Content-Type": obj.httpMetadata?.contentType ?? "image/png",
    "Cache-Control": "public, max-age=31536000, immutable",
    "ETag": obj.httpEtag,
  });
  return new Response(obj.body, { headers });
});
