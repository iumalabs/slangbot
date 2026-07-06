/** "Send it to a friend who talks like this" — per-entry share island. */
import { useState } from "react";
import type { Locale } from "../lib/i18n.ts";
import { t } from "../content/i18n.ts";

export interface ShareButtonsProps extends Record<string, unknown> {
  locale: Locale;
  url: string;
}

export function ShareButtons(props: ShareButtonsProps) {
  const ui = t(props.locale);
  const [copied, setCopied] = useState(false);
  const text = ui.shareFriendText(props.url);
  const encoded = encodeURIComponent(text);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text, url: props.url });
        return;
      } catch {
        // fall through
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // intents below remain usable
    }
  }

  return (
    <div className="share-buttons">
      <button type="button" className="share-btn primary" onClick={share}>
        {copied ? ui.copied : ui.shareFriend}
      </button>
      <span className="share-intents">
        <a
          href={`https://twitter.com/intent/tweet?text=${encoded}`}
          target="_blank"
          rel="noopener"
        >
          X
        </a>
        <a
          href={`https://t.me/share/url?url=${
            encodeURIComponent(props.url)
          }&text=${encoded}`}
          target="_blank"
          rel="noopener"
        >
          TG
        </a>
        <a
          href={`https://wa.me/?text=${encoded}`}
          target="_blank"
          rel="noopener"
        >
          WA
        </a>
      </span>
    </div>
  );
}
