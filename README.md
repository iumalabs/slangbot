# slangbot

**the Internet's Unofficial Manual of Argot** — a fully autonomous daily
dictionary of American/internet slang, deployed at [iuma.dev](https://iuma.dev).
"slangbot" is the product name (see `SITE_NAME` in `src/config.ts`); "iuma.dev"
is just the domain the owner attached to it.

Every day at 00:00 UTC a cron job picks one trending slang term, writes a full
bilingual (EN/RU) entry, generates two plausible fake definitions for the
guess-the-meaning mini-game, and draws an ironic illustration. No humans are
involved in daily operation.

Stack: a single Cloudflare Worker (Hono + React SSR with hydrated islands),
Workers AI, D1, KV, R2, Cron Triggers, Workers Assets, Turnstile, AI Gateway,
Cloudflare Access. Toolchain: **Deno only** (wrangler and esbuild run via `npm:`
specifiers; no `package.json`, no npm/node/npx).

## Commands

| Task                                               | What it does                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `deno task dev`                                    | client-bundle watcher + `wrangler dev --test-scheduled`                                                                     |
| `deno task build:client`                           | bundle `assets/client.js` (islands hydration)                                                                               |
| `deno task build`                                  | full build for Workers Builds (deno install + client)                                                                       |
| `deno task deploy:preview`                         | upload a Worker version (used by Workers Builds for non-production branches, and locally as an escape hatch)                |
| `deno task deploy:production`                      | apply D1 migrations + deploy to iuma.dev (used by Workers Builds for the production branch, and locally as an escape hatch) |
| `deno task test`                                   | full test suite (`deno test -A`)                                                                                            |
| `deno task lint`                                   | `deno lint` + `deno fmt --check`                                                                                            |
| `deno task db:migrate:local` / `db:migrate:remote` | apply D1 migrations                                                                                                         |
| `deno task seed`                                   | insert one demo term into the local D1                                                                                      |

`deno fmt`, `deno lint`, and `deno task check` are all clean.

**Pre-commit hook**: run `deno task hooks:install` once after cloning — it
points `core.hooksPath` at the committed `.githooks/` directory, so every
`git commit` runs the same gate as CI (fmt check, lint, typecheck, AI isolation,
tests) before the commit is created. Bypass in an emergency with
`git commit --no-verify`.

The intended way to deploy is the Cloudflare Workers ↔ GitHub integration (see
"Deploys" below), which calls `deploy:preview` / `deploy:production` for you on
every push — running them locally is possible but not the default workflow.

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

2. **Create the AI Gateway** named `iuma-gw`: dashboard → AI → AI Gateway →
   Create gateway → name `iuma-gw` (enable logging). All model calls are routed
   through it.

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

7. **Custom domain (manual, owner-only step)**: attach `iuma.dev` to the Worker
   in the dashboard (Workers → iuma → Settings → Domains & Routes). This repo
   deliberately configures no routes. `.dev` is HSTS-preloaded, so the site is
   HTTPS-only; all generated URLs already use `https://iuma.dev`.

## Deploys (Cloudflare Workers ↔ GitHub integration)

All deploys run through **Workers Builds** — Cloudflare's own Git integration.
Nothing deploys from a laptop:

- push to **`main`** → Workers Builds builds and deploys to production
  (iuma.dev);
- push to **any other branch** → Workers Builds uploads a _version_ and posts
  its preview URL (`https://<version>-iuma.<account>.workers.dev`) on the
  commit/PR — production stays untouched;
- GitHub Actions (`ci.yml`, CodeQL, gitleaks) remain the PR quality gates; they
  do not deploy anything.

One-time setup in the dashboard (Workers & Pages → iuma → Settings → Build →
**Connect** a Git repository), then fill the build configuration in:

| Field             | Value                                |
| ----------------- | ------------------------------------ |
| Git repository    | `maksimyugai/iumadev`                |
| Production branch | `main`                               |
| Build command     | `npx -y deno task build`             |
| Deploy command    | `npx -y deno task deploy:production` |
| Version command   | `npx -y deno task deploy:preview`    |
| Root directory    | `/`                                  |

("Deploy command" runs on pushes to the production branch; "Version command"
runs on every other branch and uploads a preview version instead.)

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

The production deploy command applies pending migrations **before** deploying
(`d1 migrations apply … && wrangler deploy`). This is safe and automatic:

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
  manually from the Actions tab. Because applying is idempotent, it coexists
  safely with the deploy-command step; it needs a `CLOUDFLARE_API_TOKEN`
  repository secret with the Account → D1 → Edit permission.

### Escape hatch: deploying from a local machine

The Git integration is the intended path, but nothing technically prevents a
local deploy — wrangler works as long as you are authenticated (either
`wrangler login`, or a `CLOUDFLARE_API_TOKEN` env var with the "Edit Cloudflare
Workers" permissions):

```sh
deno task build

# upload a preview version (production untouched, prints the preview URL):
deno task deploy:preview

# deploy straight to production (iuma.dev) — use sparingly; it bypasses the
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

Dashboard → Turnstile → Add site → domain `iuma.dev` (plus your `*.workers.dev`
host for testing) → widget type "Managed". Copy the **site key** into
`TURNSTILE_SITE_KEY` and the **secret key** into the `TURNSTILE_SECRET` secret.
The committed keys are Cloudflare's official test keys, which always pass — fine
for local dev.

### Cloudflare Access setup (admin panel)

`/admin/*` is protected twice: by Cloudflare Access at the edge and by JWT
verification inside the Worker (signature + `aud` against the team certs — a
spoofed `Cf-Access-Jwt-Assertion` header is rejected).

1. Zero Trust dashboard → Access → Applications → **Add an application** →
   Self-hosted.
2. Application domain: `iuma.dev/admin*`. During development add a second domain
   for `iuma.<account>.workers.dev/admin*`.
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
safe. Visit `https://iuma.dev/admin` (through your Zero Trust WARP client, per
the policy above), click "re-run today's pipeline" — or fill in a date under
"regenerate" to redo/backfill a specific day, optionally "illustration only".

`/admin/run` and `/admin/regenerate` also respond with JSON instead of the admin
HTML page when the caller sends `Accept: application/json` — handy for
`curl`-ing them from your own WARP-connected machine
(`curl -X POST https://iuma.dev/admin/run -H "Accept: application/json"`,
authenticated the same way a browser would be, e.g. via a cached Access session
cookie or `cloudflared access curl`). There's no GitHub Actions / Service Token
path here on purpose — a `Require: Warp` policy has no way to pass for a cloud
CI runner, so unattended automation isn't compatible with this policy shape; the
admin panel is the intended trigger surface.

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

The illustration is validated after generation: LLaVA answers whether the image
contains readable text or human figures (the two classic flux-1-schnell defects
— the prompt already bans both and never mentions the term itself, since the
model loves rendering quoted words as typography). A flagged image triggers
exactly one stricter regeneration; the second result ships regardless, and the
check fails open — a broken validator never blocks the daily issue.

Comfortably inside the free tier, and — because AI usage is a function of the
cron only — **traffic volume has zero effect on AI spend.** All calls go through
the `iuma-gw` AI Gateway with logging, and every text call sets `max_tokens`.

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
