/** Locale helpers. EN lives at /, RU at /ru/... (path prefix, crawlable). */

export type Locale = "en" | "ru";

export const LOCALES: Locale[] = ["en", "ru"];

/** Path prefix for a locale ("" for en, "/ru" for ru). */
export function prefix(locale: Locale): string {
  return locale === "ru" ? "/ru" : "";
}

/** Build a localized path: localePath("ru", "/term/rizz") -> "/ru/term/rizz". */
export function localePath(locale: Locale, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (locale === "en") return p === "" ? "/" : p;
  return p === "/" ? "/ru/" : `/ru${p}`;
}

/** The same path in the other locale (for the toggle + hreflang). */
export function alternatePath(locale: Locale, path: string): string {
  const bare = locale === "ru" && path.startsWith("/ru")
    ? path.slice(3) || "/"
    : path;
  return localePath(locale === "en" ? "ru" : "en", bare);
}

/** Locale-aware date line, always UTC. */
export function formatDate(date: string, locale: Locale): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Today's issue date (UTC). */
export function todayUTC(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
