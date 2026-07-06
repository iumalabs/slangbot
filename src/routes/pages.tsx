/** SSR pages: home (game mode), permalinks, archive, 404. */
import { Hono } from "hono";
import type { Env } from "../env.ts";
import { CANONICAL_ORIGIN, SITE_NAME, TAGLINE } from "../config.ts";
import {
  getDayNumber,
  getLatestTerm,
  getPublishedSlugsAndTerms,
  getTermBySlug,
  listTerms,
  parseFakeDefs,
} from "../lib/d1.ts";
import { localizeEntry } from "../lib/entry.ts";
import { type Locale, localePath, todayUTC } from "../lib/i18n.ts";
import { shuffledChoices } from "../lib/game.ts";
import { t } from "../content/i18n.ts";
import { Layout } from "../components/Layout.tsx";
import {
  EntryBody,
  EntryCard,
  IllustrationSlot,
} from "../components/EntryCard.tsx";
import { ArchiveGrid } from "../components/ArchiveGrid.tsx";
import { Island } from "../components/Island.tsx";
import { GuessGame } from "../islands/GuessGame.tsx";
import { StreakBadge } from "../islands/StreakBadge.tsx";
import { ShareButtons } from "../islands/ShareButtons.tsx";
import { SuggestForm } from "../islands/SuggestForm.tsx";
import { renderPage } from "./render.tsx";

export const pages = new Hono<{ Bindings: Env }>();

async function publishedSlugSet(db: D1Database): Promise<Set<string>> {
  return new Set((await getPublishedSlugsAndTerms(db)).map((p) => p.slug));
}

function notFoundPage(locale: Locale, path: string) {
  const ui = t(locale);
  return (
    <Layout
      locale={locale}
      path={path}
      title={`404 · ${SITE_NAME}`}
      description={TAGLINE}
    >
      <section className="card slim">
        <h1 className="page-title">{ui.notFound}</h1>
        <p>
          <a href={localePath(locale, "/")}>{ui.backHome}</a>
        </p>
      </section>
    </Layout>
  );
}

async function homePage(
  c: { env: Env; req: { path: string } },
  locale: Locale,
) {
  const today = todayUTC();
  const row = await getLatestTerm(c.env.DB, today);
  const ui = t(locale);
  const path = localePath(locale, "/");

  if (!row) {
    return await renderPage(
      <Layout
        locale={locale}
        path={path}
        title={SITE_NAME}
        description={TAGLINE}
      >
        <section className="card slim">
          <p>{ui.noEntryYet}</p>
        </section>
      </Layout>,
      { status: 200 },
    );
  }

  const dayNumber = await getDayNumber(c.env.DB, row.date);
  const slugs = await publishedSlugSet(c.env.DB);
  const entry = localizeEntry(row, locale, dayNumber, slugs);

  // Game mode: the real definition and both fakes are shuffled server-side;
  // the correct index never reaches the client.
  const fakes = parseFakeDefs(row);
  const real = locale === "ru" ? row.definition_ru : row.definition_en;
  const fakePair = locale === "ru" ? fakes.ru : fakes.en;
  const choices = await shuffledChoices(row.slug, c.env.COOKIE_HMAC_SECRET, [
    real,
    fakePair[0],
    fakePair[1],
  ]);
  const permalink = localePath(locale, `/term/${row.slug}`);

  const title = `${row.term} · ${SITE_NAME} — ${ui.todaysWord}`;
  return await renderPage(
    <Layout
      locale={locale}
      path={path}
      title={title}
      description={ui.gameTitle}
      ogImage={`${CANONICAL_ORIGIN}/og/term/${row.slug}.png`}
      tickerDate={row.date}
      tickerSources={row.trend_source || "seed"}
      dayNumber={dayNumber}
    >
      <article className="card">
        <div className="card-sheen" aria-hidden="true"></div>
        <header className="card-header">
          <p className="card-kicker">
            {ui.todaysWord} · {ui.tickerDay} {dayNumber}
            {entry.suggestedByReader ? ` · ${ui.requestedByReader}` : ""}
          </p>
          <h1 className="term">{row.term}</h1>
          <p className="term-meta">
            {row.ipa}
            {locale === "ru" && row.respelled_ru
              ? ` · ${row.respelled_ru}`
              : ""} · {row.pos}
          </p>
        </header>
        <IllustrationSlot
          imageKey={row.image_key}
          term={row.term}
          locale={locale}
        />
        <Island
          name="GuessGame"
          component={GuessGame}
          props={{ slug: row.slug, date: row.date, locale, choices, permalink }}
        />
        <Island
          name="StreakBadge"
          component={StreakBadge}
          props={{ locale, date: row.date, dayNumber }}
        />
        <Island
          name="ShareButtons"
          component={ShareButtons}
          props={{ locale, url: `${CANONICAL_ORIGIN}/term/${row.slug}` }}
        />
      </article>
      <Island
        name="SuggestForm"
        component={SuggestForm}
        props={{ locale, sitekey: c.env.TURNSTILE_SITE_KEY }}
      />
    </Layout>,
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function termPage(c: { env: Env }, locale: Locale, slug: string) {
  const row = await getTermBySlug(c.env.DB, slug);
  const path = localePath(locale, `/term/${slug}`);
  if (!row) {
    return await renderPage(notFoundPage(locale, path), { status: 404 });
  }
  const dayNumber = await getDayNumber(c.env.DB, row.date);
  const slugs = await publishedSlugSet(c.env.DB);
  const entry = localizeEntry(row, locale, dayNumber, slugs);
  const ui = t(locale);
  const title = `${row.term} · ${SITE_NAME}`;

  return await renderPage(
    <Layout
      locale={locale}
      path={path}
      title={title}
      description={entry.definition.slice(0, 200)}
      ogImage={`${CANONICAL_ORIGIN}/og/term/${row.slug}.png`}
      tickerDate={row.date}
      tickerSources={row.trend_source || "seed"}
      dayNumber={dayNumber}
    >
      <EntryCard entry={entry} locale={locale}>
        <p className="term-meta">
          {row.ipa}
          {locale === "ru" && row.respelled_ru ? ` · ${row.respelled_ru}` : ""}
          {" "}
          · {row.pos}
        </p>
        <EntryBody entry={entry} locale={locale} />
        <Island
          name="ShareButtons"
          component={ShareButtons}
          props={{ locale, url: `${CANONICAL_ORIGIN}/term/${row.slug}` }}
        />
      </EntryCard>
      <p className="back-link">
        <a href={localePath(locale, "/archive")}>← {ui.archive}</a>
      </p>
    </Layout>,
  );
}

async function archivePage(
  c: { env: Env; req: { query(name: string): string | undefined } },
  locale: Locale,
) {
  const search = (c.req.query("q") ?? "").slice(0, 60);
  const terms = await listTerms(c.env.DB, { search: search || undefined });
  const path = localePath(locale, "/archive");
  const ui = t(locale);
  return await renderPage(
    <Layout
      locale={locale}
      path={path}
      title={`${ui.archiveTitle} · ${SITE_NAME}`}
      description={TAGLINE}
    >
      <ArchiveGrid terms={terms} locale={locale} search={search} />
    </Layout>,
  );
}

pages.get("/", (c) => homePage(c, "en"));
pages.get("/ru", (c) => c.redirect("/ru/", 301));
pages.get("/ru/", (c) => homePage(c, "ru"));
pages.get("/term/:slug", (c) => termPage(c, "en", c.req.param("slug")));
pages.get("/ru/term/:slug", (c) => termPage(c, "ru", c.req.param("slug")));
pages.get("/archive", (c) => archivePage(c, "en"));
pages.get("/ru/archive", (c) => archivePage(c, "ru"));

export function render404(locale: Locale, path: string): Promise<Response> {
  return renderPage(notFoundPage(locale, path), { status: 404 });
}
