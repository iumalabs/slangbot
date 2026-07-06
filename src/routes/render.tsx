/** Stream a React page through a Hono response. */
import type { ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server";

export async function renderPage(
  element: ReactElement,
  init: ResponseInit = {},
): Promise<Response> {
  // React 18 emits <!DOCTYPE html> itself when the root element is <html>.
  const stream = await renderToReadableStream(element);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "public, max-age=60");
  }
  return new Response(stream, { ...init, headers });
}
