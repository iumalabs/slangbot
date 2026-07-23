/** Local streak + Wordle-style weekly emoji share grid. */
import { useEffect, useState } from "react";
import type { Locale } from "../lib/i18n.ts";
import { t } from "../content/i18n.ts";
import {
  currentStreak,
  type ResultsMap,
  shareString,
  weekGrid,
} from "../lib/streak.ts";
import { SHARE_HOST, SITE_NAME } from "../config.ts";

export interface StreakBadgeProps extends Record<string, unknown> {
  locale: Locale;
  date: string;
  dayNumber: number;
}

export function StreakBadge(props: StreakBadgeProps) {
  const ui = t(props.locale);
  const [results, setResults] = useState<ResultsMap>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = () => {
      try {
        setResults(
          JSON.parse(
            localStorage.getItem("slangbot:results") ?? "{}",
          ) as ResultsMap,
        );
      } catch {
        setResults({});
      }
    };
    load();
    globalThis.addEventListener("slangbot:result", load);
    return () => globalThis.removeEventListener("slangbot:result", load);
  }, []);

  const grid = weekGrid(results, props.date);
  const streak = currentStreak(results, props.date);
  if (!grid) return null;

  async function share() {
    const text = shareString(
      SITE_NAME,
      props.dayNumber,
      results,
      props.date,
      SHARE_HOST,
    );
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable; intents below still work
    }
  }

  const text = encodeURIComponent(
    shareString(SITE_NAME, props.dayNumber, results, props.date, SHARE_HOST),
  );

  return (
    <div className="streak-badge">
      <span
        className="streak-grid"
        aria-label={`${ui.streak}: ${streak} ${ui.days}`}
      >
        {grid}
      </span>
      <span className="streak-count">
        {ui.streak}: {streak} {ui.days}
      </span>
      <button type="button" className="share-btn" onClick={share}>
        {copied ? ui.copied : ui.shareWeek}
      </button>
      <span className="share-intents">
        <a
          href={`https://twitter.com/intent/tweet?text=${text}`}
          target="_blank"
          rel="noopener"
        >
          X
        </a>
        <a
          href={`https://t.me/share/url?url=https://${SHARE_HOST}&text=${text}`}
          target="_blank"
          rel="noopener"
        >
          TG
        </a>
        <a href={`https://wa.me/?text=${text}`} target="_blank" rel="noopener">
          WA
        </a>
      </span>
    </div>
  );
}
