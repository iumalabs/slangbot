/**
 * Step 4: Flux illustration with a vision-model quality gate.
 *
 * flux-1-schnell has three recurring defects: it renders the term as
 * typography (despite "no text" in the prompt), mangles human anatomy (hands
 * especially), and — when fed the guessing-game's deliberately vague
 * definition — drifts into generic mood-board scenes with no real connection
 * to the term. The prompt is built from a dedicated `illustration_brief_en`
 * field instead (see ai/prompts.ts) and bans humans outright; after
 * generating we ask LLaVA whether text, humans, or an unrelated scene came
 * out, and regenerate once with a stricter prompt if so. The second attempt
 * is stored either way — a slightly flawed image beats a missing one, and the
 * admin can always regenerate the illustration alone.
 */

import { runImage, runVision } from "../ai/gateway.ts";
import { extractJson } from "../ai/gateway.ts";
import { imagePrompt, imageValidationPrompt } from "../ai/prompts.ts";

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
    const d = extractJson<
      { has_text?: unknown; has_humans?: unknown; is_relevant?: unknown }
    >(raw);
    const problems: string[] = [];
    if (d.has_text === true || d.has_text === "true") problems.push("text");
    if (d.has_humans === true || d.has_humans === "true") {
      problems.push("humans");
    }
    if (d.is_relevant === false || d.is_relevant === "false") {
      problems.push("unrelated to the term");
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
  illustrationBrief: string,
): Promise<IllustrationVerdict> {
  try {
    const answer = await runVision(
      ai,
      bytes,
      imageValidationPrompt(illustrationBrief),
    );
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
  illustrationBrief: string,
): Promise<{ key: string; note: string }> {
  let bytes = await runImage(ai, imagePrompt(illustrationBrief));
  let verdict = await validate(ai, bytes, illustrationBrief);
  let note = verdict.reason;

  if (!verdict.ok) {
    bytes = await runImage(ai, imagePrompt(illustrationBrief, 1));
    verdict = await validate(ai, bytes, illustrationBrief);
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
