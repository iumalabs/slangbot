# CLAUDE.md — slangbot project rules

Read at the start of every session in this repo. Compact ruleset that must never
be silently violated; README.md is the detailed reference.

**Keep this file small.** Whenever something here (or about to land here) can
live as a skill instead — a workflow, a how-to, anything invoked on demand
rather than needed in every session — prefer moving it to a skill
(`.claude/skills/`) and leave at most a one-line pointer. CLAUDE.md is loaded
into every session's context; skills load only when used.

## Git workflow

**Every branch is created from a freshly-fetched `origin/main` — never from
another branch, no stacking.**
`git fetch origin && git checkout -b <branch> origin/main`, every time, even
when several branches' work is related. If later work genuinely needs something
from an earlier, still-open branch, wait for that branch to merge first, then
branch from the updated `origin/main` — don't branch off the open branch as a
shortcut.

**Rebase onto `origin/main` immediately before every push, not just at branch
creation.** Branches merge out of creation order via the GitHub UI, so a
branch's diff against the _actual_ current `main` goes stale by push time.
`git fetch origin && git rebase origin/main` right before the final push;
resolve conflicts then — never leave a known-stale branch pushed on the
assumption "it'll sort itself out in the merge UI."

**Never remove git branches** — local or remote, merged or not. Once a branch is
pushed, it stays.

Commits: English messages, no Anthropic co-author trailer, Conventional Commits
prefix (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `test:`, …) —
release-please reads these to compute the next semver bump, see README →
"Releases".

## Deploys

No local deploys by default: pushes to non-`main` branches get preview versions
via Workers Builds; production ships only by merging to `main` (see README →
"Deploys"). `deno task deploy:preview` / `deploy:production` exist as documented
escape hatches.

## Quality gate

`deno task hooks:install` once after cloning — the pre-commit hook runs the same
gate as CI (fmt check, lint, typecheck, AI isolation, tests, route/e2e
coverage).

**Route/e2e coverage:** every handler in `src/routes/` must be exercised by the
route-level tests in `test/*.ts` (`deno task check:coverage`, backed by
`scripts/check-route-coverage.ts`). Genuinely unreachable branches under
`deno test` (see the script's `EXCEPTIONS`) need a justified entry there, not a
silently skipped test.

**Cost guarantee:** Workers AI is called only from `src/pipeline/` and `src/ai/`
— enforced by `deno task check:ai` and CI. Never call a model from a user-facing
request path.

## Naming

"slangbot" is the product name (`SITE_NAME` in `src/config.ts`); the live domain
is `slangbot.maksimyugai.com` (`CANONICAL_ORIGIN`); the GitHub repository is
`maksimyugai/slangbot`. "iuma" survives only as the internal Cloudflare resource
name (Worker name, D1/KV/R2, AI Gateway) — those were never renamed since
renaming means recreating the resources; don't read anything into it. Telegram:
`@slangbotapp` is the channel, `@daily_slangbot` is the bot — don't mix them up.
