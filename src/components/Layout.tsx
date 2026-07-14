import type { ReactNode } from "react";
import { CANONICAL_ORIGIN, SITE_NAME, TAGLINE } from "../config.ts";
import {
  alternatePath,
  formatDate,
  type Locale,
  localePath,
} from "../lib/i18n.ts";
import { t } from "../content/i18n.ts";

export interface LayoutProps {
  locale: Locale;
  /** Current path including locale prefix, e.g. "/ru/term/rizz". */
  path: string;
  title: string;
  description: string;
  ogImage?: string;
  tickerDate?: string;
  tickerSources?: string;
  dayNumber?: number;
  /** Show the "admin" pill (visitor carries a Cloudflare Access cookie). */
  showAdmin?: boolean;
  /** Explicit back control rendered above the page content. */
  backTo?: { href: string; label: string };
  children: ReactNode;
}

const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Piazzolla:ital,opsz,wght@0,7..30,400..700;1,7..30,400..600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap&subset=latin,cyrillic";

export function Layout(props: LayoutProps) {
  const ui = t(props.locale);
  const canonical = `${CANONICAL_ORIGIN}${props.path}`;
  const altPath = alternatePath(props.locale, props.path);
  const ogImage = props.ogImage ?? `${CANONICAL_ORIGIN}/og/default.png`;

  return (
    <html lang={props.locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title}</title>
        <meta name="description" content={props.description} />
        <link rel="canonical" href={canonical} />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link
          rel="icon"
          href="/favicon-32.png"
          type="image/png"
          sizes="32x32"
        />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link
          rel="alternate"
          hrefLang={props.locale === "en" ? "ru" : "en"}
          href={`${CANONICAL_ORIGIN}${altPath}`}
        />
        <link rel="alternate" hrefLang={props.locale} href={canonical} />
        <link
          rel="alternate"
          hrefLang="x-default"
          href={`${CANONICAL_ORIGIN}${
            props.locale === "ru" ? altPath : props.path
          }`}
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title={SITE_NAME}
          href={`${CANONICAL_ORIGIN}${
            props.locale === "ru" ? "/ru" : ""
          }/rss.xml`}
        />
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:title" content={props.title} />
        <meta property="og:description" content={props.description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:locale"
          content={props.locale === "ru" ? "ru_RU" : "en_US"}
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={props.title} />
        <meta name="twitter:description" content={props.description} />
        <meta name="twitter:image" content={ogImage} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={FONTS_URL} />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <a className="skip-link" href="#main">{ui.skipToContent}</a>
        <div className="bg-glow" aria-hidden="true"></div>
        <header className="topbar">
          <p className="ticker" aria-label="site status">
            {props.tickerDate
              ? (
                <>
                  {ui.tickerPicked} {formatDate(props.tickerDate, props.locale)}
                  {props.tickerSources
                    ? ` · ${ui.tickerSources}: ${props.tickerSources}`
                    : ""}
                  {props.dayNumber
                    ? ` · ${ui.tickerDay} ${props.dayNumber}`
                    : ""}
                </>
              )
              : `${SITE_NAME} · ${TAGLINE}`}
          </p>
          <nav className="lang-toggle" aria-label="language">
            <a
              className={`lang-pill${props.locale === "en" ? " active" : ""}`}
              href={props.locale === "en" ? undefined : altPath}
              aria-current={props.locale === "en" ? "true" : undefined}
            >
              EN
            </a>
            <a
              className={`lang-pill${props.locale === "ru" ? " active" : ""}`}
              href={props.locale === "ru" ? undefined : altPath}
              aria-current={props.locale === "ru" ? "true" : undefined}
            >
              RU
            </a>
          </nav>
        </header>
        <span className="ua-flag" aria-hidden="true"></span>
        {props.showAdmin && <a className="admin-pill" href="/admin">admin</a>}
        <div className="masthead">
          <a className="wordmark" href={localePath(props.locale, "/")}>
            <img
              className="masthead-logo"
              src="/logo.svg"
              alt=""
              width={72}
              height={72}
            />
            {SITE_NAME}
          </a>
          <p className="tagline">
            {props.locale === "ru" ? ui.tagline : TAGLINE}
          </p>
        </div>
        <main id="main" className="main">
          {props.backTo && (
            <p className="back-top">
              <a href={props.backTo.href}>← {props.backTo.label}</a>
            </p>
          )}
          {props.children}
        </main>
        <footer className="footer">
          <p className="footer-disclaimer">{ui.footerDisclaimer}</p>
          <p className="footer-links">
            <a href={localePath(props.locale, "/archive")}>{ui.archive}</a>
            {" · "}
            <a href={`${props.locale === "ru" ? "/ru" : ""}/rss.xml`}>
              {ui.footerRss}
            </a>
          </p>
          <p className="footer-copyright">
            © {new Date().getUTCFullYear()} {SITE_NAME}
          </p>
        </footer>
        <script type="module" src="/client.js"></script>
      </body>
    </html>
  );
}
