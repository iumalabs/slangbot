/** Step 4: one Flux call; PNG stored in R2 as terms/{slug}.png. */

import { runImage } from "../ai/gateway.ts";
import { imagePrompt } from "../ai/prompts.ts";

export async function illustrate(
  ai: Ai,
  images: R2Bucket,
  slug: string,
  term: string,
  definitionEn: string,
): Promise<string> {
  const bytes = await runImage(ai, imagePrompt(term, definitionEn));
  const key = `terms/${slug}.png`;
  await images.put(key, bytes.buffer as ArrayBuffer, {
    httpMetadata: { contentType: "image/png", cacheControl: "public, max-age=31536000, immutable" },
  });
  return key;
}
