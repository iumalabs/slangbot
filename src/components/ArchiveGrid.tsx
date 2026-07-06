import type { TermRow } from "../lib/d1.ts";
import { type Locale, localePath } from "../lib/i18n.ts";
import { t } from "../content/i18n.ts";

export function ArchiveGrid(
  props: { terms: TermRow[]; locale: Locale; search: string },
) {
  const { terms, locale } = props;
  const ui = t(locale);
  return (
    <section className="archive">
      <h1 className="page-title">{ui.archiveTitle}</h1>
      <form
        className="archive-search"
        method="get"
        action={localePath(locale, "/archive")}
      >
        <label className="visually-hidden" htmlFor="q">
          {ui.archiveSearch}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={props.search}
          placeholder={ui.archiveSearch}
          maxLength={60}
        />
      </form>
      {terms.length === 0
        ? <p className="archive-empty">{ui.archiveEmpty}</p>
        : (
          <ul className="archive-grid">
            {terms.map((row) => (
              <li key={row.slug} className="archive-cell">
                <a href={localePath(locale, `/term/${row.slug}`)}>
                  <span className="archive-date">{row.date}</span>
                  <span className="archive-term">{row.term}</span>
                  <span className="archive-def">
                    {(locale === "ru" ? row.definition_ru : row.definition_en)
                      .slice(0, 90)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
