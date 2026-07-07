// Cost-guarantee guard: Workers AI may only be touched from src/pipeline/
// and src/ai/ (plus the binding declaration in src/env.ts). Any AI usage on
// a user-facing request path is a build error. Run in CI and locally via
// `deno task check:ai`.

const ALLOWED = [
  "src/pipeline/",
  "src/ai/",
  "src/env.ts",
  "src/cf-types.d.ts",
];

const PATTERN = /\benv\.AI\b|\bc\.env\.AI\b|\b[Aa][Ii]\.run\(/;

const violations: string[] = [];

async function walk(dir: string): Promise<void> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      await walk(path);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (ALLOWED.some((prefix) => path.startsWith(prefix))) continue;
    const text = await Deno.readTextFile(path);
    text.split("\n").forEach((line, i) => {
      if (PATTERN.test(line)) {
        violations.push(`${path}:${i + 1}: ${line.trim()}`);
      }
    });
  }
}

await walk("src");

if (violations.length > 0) {
  console.error(
    "Workers AI usage outside src/pipeline/ and src/ai/ is forbidden:",
  );
  for (const v of violations) console.error(`  ${v}`);
  Deno.exit(1);
}
console.log("AI isolation check passed: no model calls on user-facing paths.");
