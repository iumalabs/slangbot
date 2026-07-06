import type { ReactNode } from "react";
import type { LocalizedEntry } from "../lib/entry.ts";
import { type Locale, localePath } from "../lib/i18n.ts";
import { t } from "../content/i18n.ts";

export function IllustrationSlot(
  props: { imageKey: string | null; term: string; locale: Locale },
) {
  const ui = t(props.locale);
  if (!props.imageKey) {
    return <div className="illustration skeleton" aria-hidden="true"></div>;
  }
  return (
    <img
      className="illustration"
      src={`/img/${props.imageKey}`}
      alt={ui.illustrationAlt(props.term)}
      width={640}
      height={640}
      loading="lazy"
    />
  );
}

export function UsageTags(props: { entry: LocalizedEntry; locale: Locale }) {
  const ui = t(props.locale);
  return (
    <div className="usage-tags">
      <div className="tag-group">
        <h3 className="tag-heading ok">{ui.okTags}</h3>
        <ul className="tag-list">
          {props.entry.okTags.map((tag) => (
            <li key={tag} className="tag tag-ok">{tag}</li>
          ))}
        </ul>
      </div>
      <div className="tag-group">
        <h3 className="tag-heading not-ok">{ui.notOkTags}</h3>
        <ul className="tag-list">
          {props.entry.notOkTags.map((tag) => (
            <li key={tag} className="tag tag-not-ok">{tag}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function RelatedTerms(props: { entry: LocalizedEntry; locale: Locale }) {
  const ui = t(props.locale);
  if (props.entry.related.length === 0) return null;
  return (
    <section className="related">
      <h3 className="section-heading">{ui.related}</h3>
      <ul className="related-list">
        {props.entry.related.map((r) =>
          r.published
            ? (
              <li key={r.slug}>
                <a
                  className="related-link"
                  href={localePath(props.locale, `/term/${r.slug}`)}
                >
                  {r.term}
                </a>
              </li>
            )
            : (
              <li key={r.slug}>
                <span className="related-teaser" title={ui.comingSoon}>
                  {r.term}{" "}
                  <span className="teaser-note">({ui.comingSoon})</span>
                </span>
              </li>
            )
        )}
      </ul>
    </section>
  );
}

/** The revealed entry body (permalink pages + post-guess reveal). */
export function EntryBody(props: { entry: LocalizedEntry; locale: Locale }) {
  const { entry, locale } = props;
  const ui = t(locale);
  return (
    <div className="entry-body">
      <dl className="meta-line">
        <div className="meta-item">
          <dt>{ui.pronunciation}</dt>
          <dd>
            {entry.ipa}
            {locale === "ru" && entry.respelledRu
              ? ` · ${entry.respelledRu}`
              : ""}
          </dd>
        </div>
        <div className="meta-item">
          <dt>{ui.partOfSpeech}</dt>
          <dd>{entry.pos}</dd>
        </div>
      </dl>

      <section>
        <h3 className="section-heading">{ui.definition}</h3>
        <p className="definition-text">{entry.definition}</p>
      </section>

      <section>
        <h3 className="section-heading">{ui.origin}</h3>
        <p>{entry.origin}</p>
      </section>

      <section>
        <h3 className="section-heading">{ui.example}</h3>
        <blockquote className="example">{entry.example}</blockquote>
        <p className="example-note">
          <span className="example-note-label">{ui.exampleNote}:</span>{" "}
          {entry.exampleNote}
        </p>
      </section>

      <UsageTags entry={entry} locale={locale} />
      <RelatedTerms entry={entry} locale={locale} />
    </div>
  );
}

/** Glossy dictionary card frame. */
export function EntryCard(props: {
  entry: LocalizedEntry;
  locale: Locale;
  children?: ReactNode;
}) {
  const { entry, locale } = props;
  const ui = t(locale);
  return (
    <article className="card">
      <div className="card-sheen" aria-hidden="true"></div>
      <header className="card-header">
        <p className="card-kicker">
          {ui.todaysWord} · {ui.tickerDay} {entry.dayNumber}
          {entry.suggestedByReader ? ` · ${ui.requestedByReader}` : ""}
        </p>
        <h1 className="term">{entry.term}</h1>
      </header>
      <IllustrationSlot
        imageKey={entry.imageKey}
        term={entry.term}
        locale={locale}
      />
      {props.children}
    </article>
  );
}
