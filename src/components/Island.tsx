import type { ComponentType, ReactNode } from "react";
import { createElement } from "react";

/**
 * Island mount point. The server renders the component inside a marker div;
 * assets/client.js hydrates exactly these nodes and nothing else.
 *
 * Props must be JSON-serializable and must NOT contain secrets or the guess
 * answer — they are shipped verbatim to the browser.
 */
export function Island<P extends Record<string, unknown>>(props: {
  name: string;
  component: ComponentType<P>;
  props: P;
  children?: ReactNode;
}) {
  return (
    <div
      data-island={props.name}
      data-props={JSON.stringify(props.props).replace(/</g, "\\u003c")}
    >
      {createElement(props.component, props.props)}
    </div>
  );
}
