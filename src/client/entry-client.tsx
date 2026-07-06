/**
 * Island hydration bootstrap — the only client-side JS on the site.
 * Hydrates [data-island] mount points; everything else stays static HTML.
 */
import { hydrateRoot } from "react-dom/client";
import { type ComponentType, createElement } from "react";
import { GuessGame } from "../islands/GuessGame.tsx";
import { StreakBadge } from "../islands/StreakBadge.tsx";
import { ShareButtons } from "../islands/ShareButtons.tsx";
import { SuggestForm } from "../islands/SuggestForm.tsx";

// deno-lint-ignore no-explicit-any
const registry: Record<string, ComponentType<any>> = {
  GuessGame,
  StreakBadge,
  ShareButtons,
  SuggestForm,
};

for (const el of document.querySelectorAll<HTMLElement>("[data-island]")) {
  const name = el.dataset.island ?? "";
  const Component = registry[name];
  if (!Component) continue;
  let props: Record<string, unknown> = {};
  try {
    props = JSON.parse(el.dataset.props ?? "{}");
  } catch {
    continue;
  }
  hydrateRoot(el, createElement(Component, props));
}
