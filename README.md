# slangbot

**the Internet's Unofficial Manual of Argot** — a fully autonomous daily
dictionary of American/internet slang, deployed at
[slangbot.iuma.dev](https://slangbot.iuma.dev). "slangbot" is the product name
(see `SITE_NAME` in `src/config.ts` and `CANONICAL_ORIGIN` for the live domain).
The underlying Cloudflare resources (Worker name, D1/KV/R2, AI Gateway) still
carry the project's original codename, "iuma" — that's internal plumbing only,
see `CLAUDE.md` → Naming.

Every day at 00:00 UTC a cron job picks one trending slang term, writes a full
bilingual (EN/RU) entry, generates two plausible fake definitions for the
guess-the-meaning mini-game, and draws an ironic illustration. No humans are
involved in daily operation.

Stack: a single Cloudflare Worker (Hono + React SSR with hydrated islands),
Workers AI, D1, KV, R2, Cron Triggers, Workers Assets, Turnstile, AI Gateway,
Cloudflare Access. Toolchain: **Deno only** (wrangler and esbuild run via `npm:`
specifiers; no `package.json`, no npm/node/npx).

## Commands

| Task                                               | What it does                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `deno task dev`                                    | client-bundle watcher + `wrangler dev --test-scheduled`                                                                              |
| `deno task build:client`                           | bundle `assets/client.js` (islands hydration)                                                                                        |
| `deno task build`                                  | full build for Workers Builds (deno install + client)                                                                                |
| `deno task deploy:preview`                         | upload a Worker version (used by Workers Builds for non-production branches, and locally as an escape hatch)                         |
| `deno task deploy:production`                      | apply D1 migrations + deploy to slangbot.iuma.dev (used by Workers Builds for the production branch, and locally as an escape hatch) |
| `deno task test`                                   | full test suite (`deno test -A`)                                                                                                     |
| `deno task check:coverage`                         | route/e2e coverage gate — every `src/routes/` handler must be exercised (run after `deno task test:coverage`)                        |
| `deno task lint`                                   | `deno lint` + `deno fmt --check`                                                                                                     |
| `deno task db:migrate:local` / `db:migrate:remote` | apply D1 migrations                                                                                                                  |
| `deno task seed`                                   | insert one demo term into the local D1                                                                                               |

`deno fmt`, `deno lint`, and `deno task check` are all clean.

**Pre-commit hook**: run `deno task hooks:install` once after cloning — it
points `core.hooksPath` at the committed `.githooks/` directory, so every
`git commit` runs the same gate as CI (fmt check, lint, typecheck, AI isolation,
tests, route/e2e coverage) plus a secret scan before the commit is created.
Bypass in an emergency with `git commit --no-verify`.

**Secret scanning (gitleaks) is local-only, not in CI**: the `gitleaks-action`
GitHub App requires a paid plan for organizations, so instead the pre-commit
hook runs `gitleaks protect --staged` on every commit — install the CLI once
with `go install github.com/zricethezav/gitleaks/v8@latest` or
`brew install gitleaks`. A known non-secret (the public Access `AUD` tag in
`wrangler.toml`) is suppressed with an inline `# gitleaks:allow` comment.

The intended way to deploy is the Cloudflare Workers ↔ GitHub integration (see
"Deploys" below); running `deploy:preview` / `deploy:production` locally is
possible but not the default workflow. Production only ships via the "Deploy to
production" GitHub Actions workflow, triggered by a published release — see
"Deploys".

Note: `deno install` (run automatically by `dev`/`build`) materializes a
gitignored `node_modules` from the `deno.json` import map — wrangler's bundler
needs it to resolve `react`/`hono`/`workers-og`. It is not npm and there is no
`package.json`.

## First-time setup

1. **Create resources** (one-time):

   ```sh
   deno run -A npm:wrangler@latest d1 create iuma-db
   deno run -A npm:wrangler@latest kv namespace create iuma-kv
   deno run -A npm:wrangler@latest r2 bucket create iuma-images
   ```

   Paste the printed `database_id` and KV `id` into `wrangler.toml`.

2. **Create the AI Gateway** named `slangbot-gw`: dashboard → AI → AI Gateway →
   Create gateway → name `slangbot-gw` (enable logging). All model calls are
   routed through it.

3. **Migrations**:

   ```sh
   deno task db:migrate:remote   # or db:migrate:local for dev
   ```

4. **Secrets** (never committed; `wrangler secret put <NAME>`):

   | Secret                    | Purpose                                                                |
   | ------------------------- | ---------------------------------------------------------------------- |
   | `TURNSTILE_SECRET`        | Turnstile server-side key                                              |
   | `COOKIE_HMAC_SECRET`      | signs visitor cookies + shuffles game choices (any long random string) |
   | `TELEGRAM_BOT_TOKEN`      | optional, only if `TELEGRAM_ENABLED = "true"`                          |
   | `TELEGRAM_CHANNEL_ID`     | optional — the public channel, e.g. `@slangbotapp` (not the bot!)      |
   | `TELEGRAM_ADMIN_CHAT_ID`  | optional — DM chat id for suggestion-moderation notices                |
   | `TELEGRAM_WEBHOOK_SECRET` | optional — random string authenticating webhook calls                  |

   For local dev create `.dev.vars` (gitignored) with the same names.

5. **Vars** in `wrangler.toml`: `TURNSTILE_SITE_KEY` (ships with the always-pass
   test key `1x00000000000000000000AA`; replace with your real site key),
   `ACCESS_TEAM_DOMAIN` (bare team name or full `myteam.cloudflareaccess.com`),
   `ADMIN_ACCESS_AUD` (the Access app's AUD tag — a public identifier present in
   every Access JWT payload, so it lives in vars, not secrets),
   `TELEGRAM_ENABLED`.

6. **Deploys — Cloudflare Workers ↔ GitHub integration** (see the "Deploys"
   section below); a local escape hatch exists too, but isn't the default.

7. **Custom domain**: `wrangler.toml` declares
   `[[routes]] pattern = "slangbot.iuma.dev" custom_domain = true`, so the next
   deploy attaches it automatically — **provided `iuma.dev` is already an active
   zone in this Cloudflare account** (Dashboard → Add a domain, if not). If you
   ever repoint the app at a different domain, this is the only place to change
   it (plus the Turnstile/Access dashboard settings below, which aren't code).

## Deploys (Cloudflare Workers ↔ GitHub integration, gated by releases)

Builds run through **Workers Builds** — Cloudflare's own Git integration.
Nothing builds from a laptop, but going live to production only happens when a
release ships, not on every push to `main`:

- push to **`main`** → Workers Builds builds and uploads a new _version_ (does
  **not** activate it — production traffic is untouched);
- push to **any other branch** → same thing, plus a preview URL
  (`https://<version>-iuma.<account>.workers.dev`) posted on the commit/PR;
- going live is the **"Deploy to production"** GitHub Actions workflow
  (`.github/workflows/deploy.yml`), triggered automatically when release-please
  publishes a GitHub Release — i.e. right after you merge the release-please
  release PR. Merging that PR is itself the deliberate call to ship; there's no
  separate manual step after it in the normal path. The workflow rebuilds from
  the release tag and runs `deploy:production` (applies D1 migrations, then
  `wrangler deploy`). `workflow_dispatch` stays available to retry a failed
  deploy by hand without cutting a new release.
- GitHub Actions (`ci.yml`, CodeQL) remain the PR quality gates; they do not
  deploy anything. Secret scanning (gitleaks) runs locally only, via the
  pre-commit hook — see "Commands" above.

One-time setup in the dashboard (Workers & Pages → iuma → Settings → Build →
**Connect** a Git repository), then fill the build configuration in:

| Field             | Value                             |
| ----------------- | --------------------------------- |
| Git repository    | `iumalabs/slangbot`               |
| Production branch | `main`                            |
| Build command     | `npx -y deno task build`          |
| Deploy command    | `npx -y deno task deploy:preview` |
| Version command   | `npx -y deno task deploy:preview` |
| Root directory    | `/`                               |

Both "Deploy command" and "Version command" upload a version without activating
it — that's deliberate (see above). "Deploy command" runs on pushes to the
production branch, "Version command" on every other branch; they happen to be
identical here.

`deploy:preview` and `deploy:production` are ordinary tasks in `deno.json` —
reused as-is by the dashboard, and available locally too (see the escape hatch
below):

```json
"deploy:preview": "deno run -A npm:wrangler@latest versions upload",
"deploy:production": "deno run -A npm:wrangler@latest d1 migrations apply iuma-db --remote && deno run -A npm:wrangler@latest deploy"
```

Notes:

- `npx -y deno ...` is how Workers Builds invokes Deno commands in its build
  image (it ships both Node and Deno; `npx` here is just the shim Cloudflare
  documents, not an npm dependency of this repo). `deno task build` itself runs
  `deno install` (materializes `node_modules` from the `deno.json` import map so
  wrangler can resolve `react`/`hono`/`workers-og`) and bundles
  `assets/client.js`; the deploy/version commands run afterwards in the same
  workspace, so they skip re-running it.
- Previews share production bindings (same D1/KV/R2), so a preview shows real
  content — avoid destructive admin actions from a preview URL.
- To hide preview URLs behind Cloudflare Access: Workers → iuma → Settings →
  Domains & Routes → **Preview URLs** → enable Cloudflare Access, then attach
  your existing policy (e.g. the Warp-required one) to the generated
  `*-iuma.<account>.workers.dev` application. Dashboard-only switch.

### D1 migrations in this flow

The "Deploy to production" workflow's `deploy:production` task applies pending
migrations **before** deploying (`d1 migrations apply … && wrangler deploy`).
Since going live only happens when a release ships (see "Deploys" above),
migrations no longer apply automatically on every push to `main` through Workers
Builds — the "GitHub workflow backup" below (`migrate.yml`) is what still runs
automatically on a push touching `migrations/**`, ahead of the next release's
deploy. This is safe:

- **Idempotent.** D1 records applied migrations in its `d1_migrations` table, so
  the command is a no-op on deploys that add no new migration files, and it
  never re-runs an applied one.
- **Fail-safe ordering.** The `&&` means a failing migration blocks the deploy —
  old code keeps running against the old schema instead of new code crashing
  against a half-migrated one.
- **Write migrations to be backward-compatible.** Between "migration applied"
  and "new code live" the _old_ code briefly runs on the _new_ schema — and a
  rollback re-creates that state for longer. Additive changes (new tables,
  `ADD COLUMN` with a default) are always fine; destructive ones (drop / rename)
  need a two-PR dance: first ship code that works with both schemas, then drop.
  D1 migrations have no "down" — forward-only.
- **Previews don't migrate.** Non-production branches share the production D1,
  so the preview command deliberately skips `migrations apply` — a branch's
  un-merged migration must not mutate the production database. The flip side: a
  preview of a schema-changing PR runs against the old schema and may error on
  the new code paths; test those locally instead (`deno task db:migrate:local` +
  `deno task dev`).
- **GitHub workflow backup:** the "Apply D1 migrations" workflow
  (`.github/workflows/migrate.yml`) also applies pending migrations — it fires
  automatically when a push to `main` touches `migrations/**` and can be run
  manually from the Actions tab, so a new migration is live in D1 even before
  the next release deploys. Because applying is idempotent, it coexists safely
  with the deploy workflow's own migration step; it needs a
  `CLOUDFLARE_API_TOKEN` repository secret with the Account → D1 → Edit
  permission (same secret the deploy workflow uses).

### Escape hatch: deploying from a local machine

The Git integration is the intended path, but nothing technically prevents a
local deploy — wrangler works as long as you are authenticated (either
`wrangler login`, or a `CLOUDFLARE_API_TOKEN` env var with the "Edit Cloudflare
Workers" permissions):

```sh
deno task build

# upload a preview version (production untouched, prints the preview URL):
deno task deploy:preview

# deploy straight to production (slangbot.iuma.dev) — use sparingly; it bypasses the
# PR checks and can be overwritten by the next Workers Builds deploy from main:
deno task deploy:production
```

Useful for emergencies (e.g. GitHub or Workers Builds is down) — day to day,
push a branch and let the integration do it.

### Telegram channel setup (t.me/slangbotapp)

When `TELEGRAM_ENABLED = "true"`, the pipeline posts each new word to the
channel as a playable mini-game: the illustration, the three definitions labeled
A/B/C, and a native **quiz poll** — subscribers vote right in Telegram and
instantly see whether they guessed the real one (Telegram caps poll options at
100 chars, so the full definitions live in the message and the poll options are
just the letters). The shuffle order matches the site (same HMAC-derived
permutation). Re-runs of an already-published date do **not** repost, so
regenerating an entry never spams the channel.

One-time setup:

1. Create a bot via [@BotFather](https://t.me/BotFather) (`/newbot`) and copy
   the token → `wrangler secret put TELEGRAM_BOT_TOKEN`.
2. Add the bot to the channel as an **administrator** with the "Post messages"
   right (channel → Administrators → Add admin).
3. `printf '@slangbotapp' | wrangler secret put TELEGRAM_CHANNEL_ID` — the
   **channel** username, not the bot's.
4. `TELEGRAM_ENABLED` is already `"true"` in `wrangler.toml`; without the two
   secrets the step is silently skipped, so nothing breaks before setup.
5. **Post language**: the `TELEGRAM_LOCALE` var in `wrangler.toml` switches the
   channel post between `"en"` and `"ru"` (currently `"ru"`). Entries are
   bilingual in D1, so this only changes which definitions and scaffolding are
   shown; the permalink points at the matching site locale, and the RU header
   also carries the Cyrillic respelling.

### Suggestion moderation from Telegram

Every reader suggestion triggers a DM to you with inline **✅ approve / ❌
reject** buttons; pressing one updates the queue in D1 instantly (same effect as
the admin panel). Powered by a Telegram webhook served by the Worker at
`POST /api/telegram/webhook`, authenticated via the secret token Telegram echoes
back in a header — foreign calls get 403.

One-time setup:

1. Find your DM chat id: send `/start` to your bot, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` — your chat id is
   `result[0].message.chat.id` (a positive number).
   `printf '<id>' | wrangler secret put TELEGRAM_ADMIN_CHAT_ID`. (A private
   notification channel id like `-100…` works here too if you prefer one hub for
   all your apps — but beware that anyone in that channel can press the
   buttons.)
2. `openssl rand -hex 16 | tr -d '\n' | wrangler secret put TELEGRAM_WEBHOOK_SECRET`.
3. Deploy, then press **register Telegram webhook** in `/admin` (one click,
   re-runnable any time).

### Turnstile setup

Dashboard → Turnstile → Add site → domain `slangbot.iuma.dev` (plus your
`*.workers.dev` host for testing) → widget type "Managed". Copy the **site key**
into `TURNSTILE_SITE_KEY` and the **secret key** into the `TURNSTILE_SECRET`
secret. The committed keys are Cloudflare's official test keys, which always
pass — fine for local dev.

### Cloudflare Access setup (admin panel)

`/admin/*` is protected twice: by Cloudflare Access at the edge and by JWT
verification inside the Worker (signature + `aud` against the team certs — a
spoofed `Cf-Access-Jwt-Assertion` header is rejected).

1. Zero Trust dashboard → Access → Applications → **Add an application** →
   Self-hosted. (Migrating from a previous domain? Edit the existing
   application's domain field instead of creating a new one — the AUD tag stays
   the same, so `ADMIN_ACCESS_AUD` in `wrangler.toml` doesn't change.)
2. Application domain: `slangbot.iuma.dev/admin*`. During development add a
   second domain for `iuma.<account>.workers.dev/admin*`.
3. Policy: reuse an existing policy if you already have one that fits (e.g. an
   email allowlist combined with `Require: Warp` + `Require: Gateway`, so
   `/admin` is only reachable from a device connected through your Zero Trust
   WARP client) — Access lets you attach the same policy object to multiple
   applications. Otherwise create one: Allow → Include → Emails → your email
   (one-person policy).
4. After saving, open the application → **Overview** → copy the **Application
   Audience (AUD) Tag** into `ADMIN_ACCESS_AUD` in `wrangler.toml` and redeploy.
5. Set `ACCESS_TEAM_DOMAIN` in `wrangler.toml` to your team name (bare `myteam`
   works; the Worker expands it to `myteam.cloudflareaccess.com`).

Admin features: re-run today's pipeline, regenerate an entry or only its
illustration for any date, moderate the suggestion queue, edit the blocklist and
trend-source list (KV), inspect the last 50 cron log rows and the seed supply.

### Manual trigger (don't wait for the 00:00 UTC cron)

The daily pipeline is idempotent (upserts by date), so re-running it is always
safe. Visit `https://slangbot.iuma.dev/admin` (through your Zero Trust WARP
client, per the policy above), click "re-run today's pipeline" — or fill in a
date under "regenerate" to redo/backfill a specific day, optionally
"illustration only".

`/admin/run` and `/admin/regenerate` also respond with JSON instead of the admin
HTML page when the caller sends `Accept: application/json` — handy for
`curl`-ing them from your own WARP-connected machine
(`curl -X POST https://slangbot.iuma.dev/admin/run -H "Accept: application/json"`,
authenticated the same way a browser would be, e.g. via a cached Access session
cookie or `cloudflared access curl`). There's no GitHub Actions / Service Token
path here on purpose — a `Require: Warp` policy has no way to pass for a cloud
CI runner, so unattended automation isn't compatible with this policy shape; the
admin panel is the intended trigger surface.

## Releases

Semver releases are automated by
[release-please](https://github.com/googleapis/release-please)
(`.github/workflows/release-please.yml`), Google's Conventional-Commits-driven
release tool. It maintains version history (CHANGELOG, tag, GitHub Release) and,
indirectly, triggers the deploy: publishing a GitHub Release fires the "Deploy
to production" workflow automatically (see "Deploys" above) — merging the
release PR is the moment you're deciding to ship, so nothing further is needed
to go live.

- Every commit message needs a
  [Conventional Commits](https://www.conventionalcommits.org/) prefix (`feat:`,
  `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `test:`, …) — release-please
  reads these to decide the next version bump (`feat:` → minor, `fix:`/`perf:` →
  patch, `feat!:`/a `BREAKING CHANGE:` footer → major).
- On every push to `main`, release-please keeps a single up-to-date "release PR"
  open with the accumulated `CHANGELOG.md` entry and the next version in
  `.release-please-manifest.json`.
- Merging that PR tags the release directly on `main` — plain `vX.Y.Z`, no
  prerelease/build suffixes — and publishes a GitHub Release. `main` is the only
  release branch; there's no separate `release/*` branch to keep in sync.
- Config lives in `release-please-config.json` (`release-type: simple`, since
  this is a Deno project with no `package.json` to bump); the current version is
  whatever `.release-please-manifest.json` says.

## Cost model (Workers AI free tier: 10,000 neurons/day)

**The core guarantee: user traffic never triggers an AI call.** Model calls
exist only under `src/pipeline/` and `src/ai/` (grep-able convention) and are
reached exclusively from the daily cron and explicit admin actions. Guessing,
suggesting, browsing, RSS, and OG images are pure D1/KV/R2 work.

| Daily pipeline step | Model                                      | Calls/day                             | Est. neurons     |
| ------------------- | ------------------------------------------ | ------------------------------------- | ---------------- |
| Pick & dedupe       | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 1                                     | ~300             |
| Generate entry      | same (one retry max on bad JSON)           | 1–2                                   | ~1,500–3,000     |
| Illustration        | `@cf/black-forest-labs/flux-1-schnell`     | 1–2 (retry if the vision check fails) | ~50–100          |
| Illustration check  | `@cf/llava-hf/llava-1.5-7b-hf`             | 1–2                                   | ~100             |
| **Total**           |                                            | **4–7**                               | **~2,000–3,700** |

The Flux prompt is built from a dedicated `illustration_brief_en` field, not the
guessing-game `definition_en` — the definition is deliberately vague (it must
not be distinguishable from the two fakes, and never restates the term), which
starved the illustrator of anything concrete and produced generic mood-board
scenes with no real connection to the term. The brief is written purely for the
image and may describe the term's actual meaning directly and literally.

The illustration is validated after generation: LLaVA answers whether the image
contains readable text, human figures (the two classic flux-1-schnell defects —
the prompt already bans both and never quotes the term itself, since the model
loves rendering quoted words as typography), or is simply unrelated to the
brief. A flagged image triggers exactly one stricter regeneration; the second
result ships regardless, and the check fails open — a broken validator never
blocks the daily issue. The relevance check is deliberately lenient (any
loose/metaphorical connection counts) since these are surreal editorial
illustrations, not literal photos.

Comfortably inside the free tier, and — because AI usage is a function of the
cron only — **traffic volume has zero effect on AI spend.** All calls go through
the `slangbot-gw` AI Gateway with logging, and every text call sets
`max_tokens`.

## Architecture notes

- **Single Worker**, Hono router; React 18 SSR via `renderToReadableStream`,
  streamed. Static content stays static; only four islands hydrate (`GuessGame`,
  `StreakBadge`, `ShareButtons`, `SuggestForm`) from one client bundle (~50 KB
  gzipped, React included).
- **The guess game cannot leak the answer**: the three definitions are shuffled
  server-side with a permutation derived from `HMAC(COOKIE_HMAC_SECRET, slug)`.
  The SSR HTML and hydration payload carry only the shuffled texts; `/api/guess`
  recomputes the permutation to judge. A test renders the page and asserts no
  marker of the real answer exists.
- **One counted guess per visitor per term**: signed anonymous `uid` cookie + KV
  dedupe key; repeats return the entry without recounting. No accounts, no PII —
  the uid is a random UUID.
- **i18n**: EN at `/`, RU at `/ru/...`, `hreflang` alternates on every page.
  Russian UI strings live only in `src/content/i18n.ts`; entry content is
  generated bilingually by the pipeline.
- **Idempotent cron**: re-running upserts by `date`; every step is logged to
  `cron_log`; a failed illustration never blocks publishing.
- **Fallback supply**: ~220 curated seed terms ship in migration 0002; related
  terms of each published entry are auto-added to `seed_terms`, so the archive
  grows into a browsable encyclopedia and the pipeline never runs dry.
- Trigger the pipeline locally:
  `curl "http://localhost:8788/__scheduled?cron=0+0+*+*+*"` while
  `deno task dev` is running (requires Workers AI access on your account).

## Layout

```
migrations/          D1 schema + ~220 curated seed terms
src/index.tsx        Hono app: fetch + scheduled entrypoints
src/routes/          pages, api, og, img, feeds, admin
src/components/      server-only React components
src/islands/         hydrated interactive components
src/client/          hydration bootstrap (built to assets/client.js)
src/og/              OG image template (workers-og / Satori)
src/pipeline/        harvest → pick → generate → illustrate (AI lives here)
src/ai/              model ids, prompts, gateway helper (and here)
src/lib/             d1, kv, cookies, game, streak, turnstile, access-jwt, …
src/content/i18n.ts  EN/RU UI strings (the only file with Russian text)
assets/              styles.css + built client.js (gitignored)
test/                deno test suite
```
