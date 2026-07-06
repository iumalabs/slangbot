/** "Request a word" — Turnstile-gated suggestion form island. */
import { useEffect, useRef, useState } from "react";
import type { Locale } from "../lib/i18n.ts";
import { t } from "../content/i18n.ts";

export interface SuggestFormProps extends Record<string, unknown> {
  locale: Locale;
  sitekey: string;
}

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
}

/** The Turnstile script attaches itself to the global scope. */
function turnstileApi(): TurnstileApi | undefined {
  return (globalThis as { turnstile?: TurnstileApi }).turnstile;
}

export function SuggestForm(props: SuggestFormProps) {
  const ui = t(props.locale);
  const [term, setTerm] = useState("");
  const [state, setState] = useState<
    "idle" | "busy" | "done" | "error" | "rate-limited"
  >("idle");
  const [token, setToken] = useState("");
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    const render = () => {
      const ts = turnstileApi();
      if (widgetRef.current && ts && widgetId.current === null) {
        widgetId.current = ts.render(widgetRef.current, {
          sitekey: props.sitekey,
          callback: (tok: string) => setToken(tok),
        });
      }
    };
    if (turnstileApi()) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [props.sitekey]);

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!term.trim() || state === "busy") return;
    setState("busy");
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: term.trim(), turnstileToken: token }),
      });
      if (res.status === 429) {
        setState("rate-limited");
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      setState("done");
      setTerm("");
    } catch {
      setState("error");
    } finally {
      turnstileApi()?.reset(widgetId.current ?? undefined);
      setToken("");
    }
  }

  return (
    <section className="suggest">
      <h2 className="section-heading">{ui.suggestTitle}</h2>
      <p className="suggest-hint">{ui.suggestHint}</p>
      <form
        className="suggest-form"
        method="post"
        action="/api/suggest"
        onSubmit={submit}
      >
        <label className="visually-hidden" htmlFor="suggest-term">
          {ui.suggestTitle}
        </label>
        <input
          id="suggest-term"
          name="term"
          type="text"
          maxLength={40}
          required
          placeholder={ui.suggestPlaceholder}
          value={term}
          onChange={(e) => setTerm(e.currentTarget.value)}
        />
        <div ref={widgetRef} className="turnstile-slot"></div>
        <button
          type="submit"
          className="suggest-btn"
          disabled={state === "busy"}
        >
          {state === "busy" ? ui.guessSubmitting : ui.suggestSubmit}
        </button>
      </form>
      {state === "done" && (
        <p className="suggest-status ok" role="status">{ui.suggestThanks}</p>
      )}
      {state === "error" && (
        <p className="suggest-status err" role="alert">{ui.suggestError}</p>
      )}
      {state === "rate-limited" && (
        <p className="suggest-status err" role="alert">
          {ui.suggestRateLimited}
        </p>
      )}
    </section>
  );
}
