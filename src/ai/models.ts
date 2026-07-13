/**
 * Model ids and gateway config.
 *
 * COST GUARANTEE: Workers AI may ONLY be called from src/pipeline/ and
 * src/ai/ (daily cron + explicit admin actions). No user-facing request path
 * ever calls a model.
 */

export const TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
/** Vision model used to validate the generated illustration (text/anatomy). */
export const VISION_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";

/** All calls are routed through this AI Gateway (create it once, see README). */
export const AI_GATEWAY = { id: "iuma-gw" };
