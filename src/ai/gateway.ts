/** Workers AI helpers. Pipeline-only — never import from route handlers. */

import { AI_GATEWAY, IMAGE_MODEL, TEXT_MODEL } from "./models.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Run a text call with an explicit max_tokens cap. Returns the raw response text. */
export async function runText(
  ai: Ai,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<string> {
  const res = (await ai.run(
    TEXT_MODEL,
    { messages, max_tokens: maxTokens, temperature: 0.7 },
    { gateway: AI_GATEWAY },
  )) as { response?: string } | string;
  if (typeof res === "string") return res;
  if (res && typeof res.response === "string") return res.response;
  throw new Error("unexpected text model response shape");
}

/** Run the Flux image model; returns PNG/JPEG bytes. */
export async function runImage(ai: Ai, prompt: string): Promise<Uint8Array> {
  const res = (await ai.run(
    IMAGE_MODEL,
    { prompt, steps: 6 },
    { gateway: AI_GATEWAY },
  )) as { image?: string } | ReadableStream;
  if (
    res && typeof res === "object" && "image" in res &&
    typeof res.image === "string"
  ) {
    const bin = atob(res.image);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  if (res instanceof ReadableStream) {
    const buf = await new Response(res).arrayBuffer();
    return new Uint8Array(buf);
  }
  throw new Error("unexpected image model response shape");
}

/**
 * Extract the first JSON object from a model response that may be wrapped in
 * code fences or prose. Throws if nothing parseable is found.
 */
export function extractJson<T>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("no JSON object found in model output");
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}
