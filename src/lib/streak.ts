/**
 * Weekly emoji share grid (pure logic — shared by the StreakBadge island and
 * the test suite). Results map ISO dates (YYYY-MM-DD, UTC) to:
 *   "g" — first-try correct   (🟩)
 *   "y" — solved after reveal (🟨)
 *   "r" — wrong               (🟥)
 */

export type DayResult = "g" | "y" | "r";
export type ResultsMap = Record<string, DayResult>;

const EMOJI: Record<DayResult, string> = { g: "\u{1F7E9}", y: "\u{1F7E8}", r: "\u{1F7E5}" };

/** Monday of the week containing `date` (UTC). */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Emoji grid for Monday..`today`; days without a result are skipped. */
export function weekGrid(results: ResultsMap, today: string): string {
  const start = new Date(`${weekStart(today)}T00:00:00Z`);
  const end = new Date(`${today}T00:00:00Z`);
  let grid = "";
  for (const d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const r = results[key];
    if (r) grid += EMOJI[r];
  }
  return grid;
}

/** Full share string, e.g. `iuma day 142 — my week: 🟩🟩🟥 iuma.dev`. */
export function shareString(
  siteName: string,
  dayNumber: number,
  results: ResultsMap,
  today: string,
  host: string,
): string {
  const grid = weekGrid(results, today) || "\u{1F7E5}";
  return `${siteName} day ${dayNumber} — my week: ${grid} ${host}`;
}

/** Consecutive played days ending today (any result counts as played). */
export function currentStreak(results: ResultsMap, today: string): number {
  let streak = 0;
  const d = new Date(`${today}T00:00:00Z`);
  while (results[d.toISOString().slice(0, 10)]) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}
