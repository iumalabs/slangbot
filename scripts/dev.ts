// Local dev orchestrator: runs the esbuild client-bundle watcher and
// `wrangler dev` side by side. Deno-only toolchain (no npm/node/npx).
//
// `--test-scheduled` exposes http://localhost:8787/__scheduled?cron=0+0+*+*+*
// so the daily pipeline can be triggered locally.

const esbuild = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "scripts/build-client.ts", "--watch"],
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

// Give the first client build a moment so wrangler serves a real bundle.
await new Promise((r) => setTimeout(r, 3000));

const wrangler = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "npm:wrangler@latest", "dev", "--test-scheduled"],
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

const cleanup = () => {
  try {
    esbuild.kill("SIGTERM");
  } catch { /* already dead */ }
  try {
    wrangler.kill("SIGTERM");
  } catch { /* already dead */ }
};
Deno.addSignalListener("SIGINT", () => {
  cleanup();
  Deno.exit(0);
});

await wrangler.status;
cleanup();
