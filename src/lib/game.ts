/**
 * Guess-game choice ordering.
 *
 * The three candidate definitions (index 0 = real, 1..2 = fakes) are shuffled
 * with a permutation derived from HMAC(secret, slug). The permutation is
 * recomputable server-side only, so the SSR HTML and hydration payload carry
 * just the shuffled texts — never the correct index.
 */

const PERMUTATIONS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

const encoder = new TextEncoder();

/** Returns display order: order[displayIndex] = source index (0 = real). */
export async function choiceOrder(
  slug: string,
  secret: string,
): Promise<readonly [number, number, number]> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`order:${slug}`)),
  );
  return PERMUTATIONS[mac[0] % 6];
}

/** Display index of the real definition. */
export async function correctIndex(slug: string, secret: string): Promise<number> {
  const order = await choiceOrder(slug, secret);
  return order.indexOf(0);
}

/** Shuffle [real, fake1, fake2] into display order. */
export async function shuffledChoices(
  slug: string,
  secret: string,
  defs: readonly [string, string, string],
): Promise<string[]> {
  const order = await choiceOrder(slug, secret);
  return order.map((i) => defs[i]);
}
