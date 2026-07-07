// Production deploy guard. In CI (GitHub Actions sets CI=true) it deploys
// unconditionally — the workflow itself is already restricted to main.
// Locally it refuses to ship anything that is not committed main, so the
// GitHub workflow stays the single practical path to production.

async function run(
  cmd: string[],
  opts: { quiet?: boolean } = {},
): Promise<string> {
  const out = await new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: opts.quiet ? "piped" : "inherit",
  }).output();
  if (!out.success) Deno.exit(out.code);
  return new TextDecoder().decode(out.stdout).trim();
}

if (!Deno.env.get("CI")) {
  const branch = await run(["git", "branch", "--show-current"], {
    quiet: true,
  });
  if (branch !== "main") {
    console.error(
      `error: production deploys only from main (current branch: ${
        branch || "detached HEAD"
      }).\n` +
        `Push to main and let the "Deploy production" GitHub workflow ship it,\n` +
        `or use \`deno task deploy\` for a preview.`,
    );
    Deno.exit(1);
  }
  const dirty = await run(["git", "status", "--porcelain"], { quiet: true });
  if (dirty) {
    console.error(
      "error: working tree has uncommitted changes — commit them first so production matches git.",
    );
    Deno.exit(1);
  }
}

const deploy = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "npm:wrangler@latest", "deploy"],
  stdout: "inherit",
  stderr: "inherit",
}).spawn();
const status = await deploy.status;
Deno.exit(status.code);
