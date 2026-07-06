/** Stream a React page through a Hono response. */
import type { ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server";

export async function renderPage(
  element: ReactElement,
  init: ResponseInit = {},
): Promise<Response> {
  const stream = await renderToReadableStream(element);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "public, max-age=60");
  }
  return new Response(
    // Prepend the doctype; React does not emit it for <html> roots.
    stream.pipeThrough(prependDoctype()),
    { ...init, headers },
  );
}

function prependDoctype(): TransformStream<Uint8Array, Uint8Array> {
  let first = true;
  const encoder = new TextEncoder();
  return new TransformStream({
    transform(chunk, controller) {
      if (first) {
        controller.enqueue(encoder.encode("<!DOCTYPE html>"));
        first = false;
      }
      controller.enqueue(chunk);
    },
  });
}
