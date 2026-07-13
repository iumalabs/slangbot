/**
 * Step 4: Flux illustration with a vision-model quality gate.
 *
 * flux-1-schnell has two recurring defects: it renders the term as
 * typography (despite "no text" in the prompt) and mangles human anatomy
 * (hands especially). The prompt bans humans and never mentions the term;
 * after generating we ask LLaVA whether text or humans are visible, and
 * regenerate once with a stricter prompt if so. The second attempt is stored
 * either way — a slightly flawed image beats a missing one, and the admin
 * can always regenerate the illustration alone.
 */

import { runImage, runVision } from "../ai/gateway.ts";
import { extractJson } from "../ai/gateway.ts";
import { IMAGE_VALIDATION_PROMPT, imagePrompt } from "../ai/prompts.ts";

export interface IllustrationVerdict {
  ok: boolean;
  reason: string;
}

/**
 * Lenient parse of the vision model's answer. Fail-open: if the answer is
 * unparseable, the image is accepted — validation must never block
 * publishing. Exported for tests.
 */
export function parseIllustrationVerdict(raw: string): IllustrationVerdict {
  try {
    const d = extractJson<{ has_text?: unknown; has_humans?: unknown }>(raw);
    const problems: string[] = [];
    if (d.has_text === true || d.has_text === "true") problems.push("text");
    if (d.has_humans === true || d.has_humans === "true") {
      problems.push("humans");
    }
    return problems.length > 0
      ? { ok: false, reason: `vision flagged: ${problems.join(", ")}` }
      : { ok: true, reason: "vision check passed" };
  } catch {
    return { ok: true, reason: "vision answer unparseable, accepting image" };
  }
}

async function validate(
  ai: Ai,
  bytes: Uint8Array,
): Promise<IllustrationVerdict> {
  try {
    const answer = await runVision(ai, bytes, IMAGE_VALIDATION_PROMPT);
    return parseIllustrationVerdict(answer);
  } catch (e) {
    // The vision model being down must not block the daily issue.
    return { ok: true, reason: `vision check unavailable (${e})` };
  }
}

export async function illustrate(
  ai: Ai,
  images: R2Bucket,
  slug: string,
  _term: string,
  definitionEn: string,
): Promise<{ key: string; note: string }> {
  let bytes = await runImage(ai, imagePrompt(definitionEn));
  let verdict = await validate(ai, bytes);
  let note = verdict.reason;

  if (!verdict.ok) {
    bytes = await runImage(ai, imagePrompt(definitionEn, 1));
    verdict = await validate(ai, bytes);
    note = `first attempt rejected (${note}); retry: ${verdict.reason}`;
  }

  const key = `terms/${slug}.png`;
  await images.put(key, bytes.buffer as ArrayBuffer, {
    httpMetadata: {
      contentType: "image/png",
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
  return { key, note };
}
