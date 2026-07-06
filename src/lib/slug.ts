/** Slugify a term: lowercase, ASCII-ish, hyphen-separated. */
export function slugify(term: string): string {
  return term
    .toLowerCase()
    .normalize("NFKD")
    // deno-lint-ignore no-control-regex
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "term";
}

/** Resolve a slug collision by appending -2, -3, ... */
export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`could not find a free slug for "${base}"`);
}
