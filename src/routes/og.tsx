/** OG image endpoint. Satori render, KV-cached 7 days. ZERO AI calls. */
import { Hono } from "hono";
import { ImageResponse } from "workers-og";
import type { Env } from "../env.ts";
import { getDayNumber, getTermBySlug } from "../lib/d1.ts";
import { KV_KEYS } from "../lib/kv.ts";
import { OgTermCard } from "../og/OgTermCard.tsx";
import { SITE_NAME, TAGLINE } from "../config.ts";

export const og = new Hono<{ Bindings: Env }>();

const OG_TTL = 60 * 60 * 24 * 7;
const CACHE_HEADERS = {
  "Content-Type": "image/png",
  "Cache-Control": `public, max-age=${OG_TTL}`,
};

async function renderOg(element: JSX.Element): Promise<ArrayBuffer> {
  const res = new ImageResponse(element as never, { width: 1200, height: 630 });
  return await res.arrayBuffer();
}

og.get("/og/term/:file", async (c) => {
  const file = c.req.param("file");
  if (!file.endsWith(".png")) return c.notFound();
  const slug = file.slice(0, -4);

  const cacheKey = `${KV_KEYS.ogPrefix}${slug}`;
  const cached = await c.env.KV.get(cacheKey, "arrayBuffer");
  if (cached) return new Response(cached, { headers: CACHE_HEADERS });

  const row = await getTermBySlug(c.env.DB, slug);
  if (!row) return c.notFound();
  const dayNumber = await getDayNumber(c.env.DB, row.date);

  const png = await renderOg(
    <OgTermCard
      term={row.term}
      ipa={row.ipa}
      pos={row.pos}
      dayNumber={dayNumber}
    />,
  );
  await c.env.KV.put(cacheKey, png, { expirationTtl: OG_TTL });
  return new Response(png, { headers: CACHE_HEADERS });
});

og.get("/og/default.png", async (c) => {
  const cacheKey = `${KV_KEYS.ogPrefix}__default`;
  const cached = await c.env.KV.get(cacheKey, "arrayBuffer");
  if (cached) return new Response(cached, { headers: CACHE_HEADERS });
  const png = await renderOg(
    <OgTermCard term={SITE_NAME} ipa={TAGLINE} pos="" dayNumber={1} />,
  );
  await c.env.KV.put(cacheKey, png, { expirationTtl: OG_TTL });
  return new Response(png, { headers: CACHE_HEADERS });
});
