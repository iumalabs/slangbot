-- Migration number: 0003    add illustration_brief_en, a scene description
-- used only for the Flux prompt — separate from definition_en, which is
-- deliberately vague for the guessing game and gave the illustrator nothing
-- concrete to draw. Empty default for existing rows; the illustrate step
-- falls back to definition_en when it's blank (see src/pipeline/run.ts).
ALTER TABLE terms ADD COLUMN illustration_brief_en TEXT NOT NULL DEFAULT '';
