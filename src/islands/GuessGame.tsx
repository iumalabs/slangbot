/**
 * The guess-the-meaning mini-game island.
 *
 * SSR renders only the term + three shuffled candidate texts; the correct
 * index exists exclusively server-side (see src/lib/game.ts). The reveal data
 * arrives from POST /api/guess after the visitor commits to a choice.
 */
import { useEffect, useState } from "react";
import type { LocalizedEntry } from "../lib/entry.ts";
import type { Locale } from "../lib/i18n.ts";
import { t } from "../content/i18n.ts";
import { EntryBody } from "../components/EntryCard.tsx";
import { type DayResult, type ResultsMap } from "../lib/streak.ts";

export interface GuessGameProps extends Record<string, unknown> {
  slug: string;
  date: string;
  locale: Locale;
  choices: string[];
  permalink: string;
}

interface GuessResponse {
  correct: boolean;
  correctIndex: number;
  percent: number;
  entry: LocalizedEntry;
}

const RESULTS_KEY = "slangbot:results";
const CHOICE_KEY = "slangbot:choice:";

function loadResults(): ResultsMap {
  try {
    return JSON.parse(localStorage.getItem(RESULTS_KEY) ?? "{}") as ResultsMap;
  } catch {
    return {};
  }
}

function saveResult(date: string, result: DayResult) {
  const results = loadResults();
  if (!results[date]) {
    results[date] = result;
    localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
    globalThis.dispatchEvent(new CustomEvent("slangbot:result"));
  }
}

export function GuessGame(props: GuessGameProps) {
  const ui = t(props.locale);
  const [phase, setPhase] = useState<"idle" | "busy" | "revealed">("idle");
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<GuessResponse | null>(null);
  const [error, setError] = useState(false);

  // Returning visitor who already played today: re-fetch the reveal.
  useEffect(() => {
    const prior = localStorage.getItem(CHOICE_KEY + props.slug);
    if (prior !== null) submit(parseInt(prior, 10), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(choiceIndex: number, replay = false) {
    setPhase("busy");
    setPicked(choiceIndex >= 0 ? choiceIndex : null);
    try {
      const res = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: props.slug,
          choiceIndex,
          locale: props.locale,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as GuessResponse;
      setResult(data);
      setPhase("revealed");
      if (!replay) {
        localStorage.setItem(CHOICE_KEY + props.slug, String(choiceIndex));
        saveResult(
          props.date,
          choiceIndex < 0 ? "y" : data.correct ? "g" : "r",
        );
      }
    } catch {
      setError(true);
      setPhase("idle");
    }
  }

  if (phase === "revealed" && result) {
    const stat = result.percent <= 50
      ? ui.gameStat(result.percent)
      : ui.gameStatHigh(result.percent);
    return (
      <div className="game revealed">
        <p
          className={`game-verdict ${result.correct ? "correct" : "wrong"}`}
          role="status"
        >
          {picked === null
            ? ""
            : result.correct
            ? ui.gameCorrect
            : ui.gameWrong}
        </p>
        <p className="game-stat">{stat}</p>
        <ol className="choices resolved">
          {props.choices.map((text, i) => (
            <li
              key={i}
              className={`choice${i === result.correctIndex ? " is-real" : ""}${
                i === picked && !result.correct ? " is-picked-wrong" : ""
              }`}
            >
              {text}
            </li>
          ))}
        </ol>
        <EntryBody entry={result.entry} locale={props.locale} />
      </div>
    );
  }

  return (
    <div className="game">
      <h2 className="game-title">{ui.gameTitle}</h2>
      <p className="game-hint">{ui.gameHint}</p>
      <ol className="choices">
        {props.choices.map((text, i) => (
          <li key={i}>
            <button
              type="button"
              className="choice choice-btn"
              disabled={phase === "busy"}
              onClick={() => submit(i)}
            >
              {text}
            </button>
          </li>
        ))}
      </ol>
      {phase === "busy" && (
        <p className="game-busy" role="status">{ui.guessSubmitting}</p>
      )}
      {error && <p className="game-error" role="alert">{ui.suggestError}</p>}
      <p className="game-reveal-fallback">
        <button type="button" className="linklike" onClick={() => submit(-1)}>
          {ui.gameRevealLink}
        </button>
      </p>
      <noscript>
        <p>
          {ui.gameRevealNoJs} <a href={props.permalink}>{ui.gameRevealLink}</a>
        </p>
      </noscript>
    </div>
  );
}
