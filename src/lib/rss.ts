/** RSS + sitemap generation. All URLs are https (iuma.dev is HSTS-preloaded). */

import { CANONICAL_ORIGIN, SITE_NAME, TAGLINE } from "../config.ts";
import type { TermRow } from "./d1.ts";
import { type Locale, localePath } from "./i18n.ts";

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildRss(terms: TermRow[], locale: Locale): string {
  const title = locale === "ru"
    ? `${SITE_NAME} — словарь сленга`
    : `${SITE_NAME} — ${TAGLINE}`;
  const home = `${CANONICAL_ORIGIN}${localePath(locale, "/")}`;
  const items = terms
    .map((t) => {
      const link = `${CANONICAL_ORIGIN}${
        localePath(locale, `/term/${t.slug}`)
      }`;
      const desc = locale === "ru" ? t.definition_ru : t.definition_en;
      return `    <item>
      <title>${escapeXml(t.term)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${new Date(`${t.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escapeXml(desc)}</description>
    </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(home)}</link>
    <description>${escapeXml(TAGLINE)}</description>
    <language>${locale === "ru" ? "ru" : "en-us"}</language>
${items}
  </channel>
</rss>`;
}

export function buildSitemap(terms: TermRow[]): string {
  const staticPaths = ["/", "/ru/", "/archive", "/ru/archive"];
  const urls: string[] = [];
  for (const p of staticPaths) {
    urls.push(`  <url><loc>${escapeXml(CANONICAL_ORIGIN + p)}</loc></url>`);
  }
  for (const t of terms) {
    for (const locale of ["en", "ru"] as Locale[]) {
      const loc = `${CANONICAL_ORIGIN}${localePath(locale, `/term/${t.slug}`)}`;
      urls.push(
        `  <url><loc>${escapeXml(loc)}</loc><lastmod>${t.date}</lastmod></url>`,
      );
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
}
