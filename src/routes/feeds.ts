/** RSS (both locales) + sitemap. */
import { Hono } from "hono";
import type { Env } from "../env.ts";
import { listTerms } from "../lib/d1.ts";
import { buildRss, buildSitemap } from "../lib/rss.ts";

export const feeds = new Hono<{ Bindings: Env }>();

const XML_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
};

feeds.get("/rss.xml", async (c) => {
  const terms = await listTerms(c.env.DB, { limit: 30 });
  return new Response(buildRss(terms, "en"), { headers: XML_HEADERS });
});

feeds.get("/ru/rss.xml", async (c) => {
  const terms = await listTerms(c.env.DB, { limit: 30 });
  return new Response(buildRss(terms, "ru"), { headers: XML_HEADERS });
});

feeds.get("/sitemap.xml", async (c) => {
  const terms = await listTerms(c.env.DB, { limit: 500 });
  return new Response(buildSitemap(terms), { headers: XML_HEADERS });
});
