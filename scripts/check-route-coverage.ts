// E2E/route coverage guard: every Hono route handler under src/routes/ must
// be exercised by the route-level tests in test/*.ts (the closest thing this
// project has to end-to-end tests — see README "Layout"). Run in CI and
// locally via `deno task check:coverage` after `deno test -A --coverage=<dir>`.
//
// Usage: deno run -A scripts/check-route-coverage.ts <coverage-dir>
// (the dir passed to `deno test --coverage=`; this script runs
// `deno coverage <dir> --lcov` itself to get per-line data.)

const DEFAULT_MIN_LINE_PCT = 100;

// Files that can never reach the default bar, and why. Keep this list short
// and each entry justified — it's an exception to a real invariant, not a
// place to quietly lower the bar when a test is inconvenient to write.
const EXCEPTIONS: Record<string, { minLinePct: number; reason: string }> = {
  "src/routes/admin.tsx": {
    minLinePct: 98,
    reason:
      "the POST /admin/run success path (harvest -> pick -> generate all " +
      "succeeding) requires a working Workers AI mock; every other route " +
      "test in this project deliberately makes the fake AI binding throw " +
      "(see test/helpers.ts makeEnv) to guarantee no route can silently " +
      "depend on a model call succeeding. The failure branch (what every " +
      "existing pipeline-related admin test exercises) is fully covered; " +
      "only that one success branch (4 lines) is not.",
  },
  "src/routes/og.tsx": {
    minLinePct: 55,
    reason:
      "workers-og's Satori/resvg renderer loads a .wasm module that Deno's " +
      "npm-compat loader cannot resolve outside the Workers runtime " +
      "(`Could not find package 'a'` from yoga-*.wasm) — confirmed by " +
      "hand: importing workers-og at all, even lazily, fails the moment " +
      "the render path actually runs under `deno test`. Every branch " +
      "reachable without invoking the renderer (extension/slug " +
      "validation, the KV cache-hit path) is covered; the render call " +
      "itself is not exercisable here.",
  },
};

interface FileCoverage {
  path: string;
  coveredLines: number;
  totalLines: number;
}

function parseLcov(lcov: string): FileCoverage[] {
  const files: FileCoverage[] = [];
  for (const record of lcov.split("end_of_record")) {
    const sf = record.match(/^SF:(.*)$/m);
    if (!sf) continue;
    const path = sf[1].trim();
    const da = [...record.matchAll(/^DA:\d+,(\d+)$/gm)];
    const totalLines = da.length;
    const coveredLines = da.filter(([, hits]) => Number(hits) > 0).length;
    files.push({ path, coveredLines, totalLines });
  }
  return files;
}

const coverageDir = Deno.args[0];
if (!coverageDir) {
  console.error(
    "usage: deno run -A scripts/check-route-coverage.ts <coverage-dir>",
  );
  Deno.exit(2);
}

const lcovCmd = new Deno.Command(Deno.execPath(), {
  args: ["coverage", coverageDir, "--lcov"],
  stdout: "piped",
  stderr: "inherit",
});
const { code, stdout } = await lcovCmd.output();
if (code !== 0) {
  console.error(`deno coverage exited with code ${code}`);
  Deno.exit(code);
}
const lcov = new TextDecoder().decode(stdout);

const routeFiles = parseLcov(lcov).filter((f) =>
  /\/src\/routes\/[^/]+\.tsx?$/.test(f.path)
);

if (routeFiles.length === 0) {
  console.error(
    "check-route-coverage: no src/routes/*.ts(x) files found in coverage data — " +
      "did the route tests actually import/exercise every route file?",
  );
  Deno.exit(1);
}

let failed = false;
for (const f of routeFiles) {
  const rel = f.path.slice(f.path.indexOf("src/routes/"));
  const pct = f.totalLines === 0 ? 100 : (f.coveredLines / f.totalLines) * 100;
  const exception = EXCEPTIONS[rel];
  const minPct = exception?.minLinePct ?? DEFAULT_MIN_LINE_PCT;
  const ok = pct >= minPct;
  const label = exception ? `${rel} (exception: ${minPct}%+)` : rel;
  console.log(
    `${ok ? "ok " : "FAIL"} ${label}: ${pct.toFixed(1)}% lines ` +
      `(${f.coveredLines}/${f.totalLines})`,
  );
  if (!ok) failed = true;
}

if (failed) {
  console.error(
    "\nRoute coverage check failed: every handler in src/routes/ must be " +
      "exercised by a route-level (e2e) test in test/*.ts. If a branch is " +
      "genuinely unreachable under `deno test`, add a justified entry to " +
      "EXCEPTIONS in scripts/check-route-coverage.ts instead of skipping it silently.",
  );
  Deno.exit(1);
}
console.log("\nRoute coverage check passed.");
