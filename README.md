# iuma

**the Internet's Unofficial Manual of Argot** — a fully autonomous daily
dictionary of American/internet slang at [iuma.dev](https://iuma.dev).

Every day at 00:00 UTC a cron job picks one trending slang term, writes a full
bilingual (EN/RU) entry, generates two plausible fake definitions for the
guess-the-meaning mini-game, and draws an ironic illustration. No humans are
involved in daily operation.

Stack: a single Cloudflare Worker (Hono + React SSR with hydrated islands),
Workers AI, D1, KV, R2, Cron Triggers, Workers Assets, Turnstile, AI Gateway,
Cloudflare Access. Toolchain: **Deno only** (wrangler and esbuild run via `npm:`
specifiers; no `package.json`, no npm/node/npx).

## Commands

| Task                                               | What it does                                            |
| -------------------------------------------------- | ------------------------------------------------------- |
| `deno task dev`                                    | client-bundle watcher + `wrangler dev --test-scheduled` |
| `deno task build:client`                           | bundle `assets/client.js` (islands hydration)           |
| `deno task deploy`                                 | build client + deploy to workers.dev                    |
| `deno task test`                                   | full test suite (`deno test -A`)                        |
| `deno task lint`                                   | `deno lint` + `deno fmt --check`                        |
| `deno task db:migrate:local` / `db:migrate:remote` | apply D1 migrations                                     |
| `deno task seed`                                   | insert one demo term into the local D1                  |

`deno fmt`, `deno lint`, and `deno task check` are all clean.

Note: `deno install` (run automatically by `dev`/`deploy`) materializes a
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

   | Secret                | Purpose                                                                |
   | --------------------- | ---------------------------------------------------------------------- |
   | `TURNSTILE_SECRET`    | Turnstile server-side key                                              |
   | `COOKIE_HMAC_SECRET`  | signs visitor cookies + shuffles game choices (any long random string) |
   | `ADMIN_ACCESS_AUD`    | Cloudflare Access application AUD tag (see below)                      |
   | `TELEGRAM_BOT_TOKEN`  | optional, only if `TELEGRAM_ENABLED = "true"`                          |
   | `TELEGRAM_CHANNEL_ID` | optional, e.g. `@iuma_daily`                                           |

   For local dev create `.dev.vars` (gitignored) with the same names.

5. **Vars** in `wrangler.toml`: `TURNSTILE_SITE_KEY` (ships with the always-pass
   test key `1x00000000000000000000AA`; replace with your real site key),
   `ACCESS_TEAM_DOMAIN` (e.g. `myteam.cloudflareaccess.com`),
   `TELEGRAM_ENABLED`.

6. **Deploy**: `deno task deploy` → `https://iuma.<account>.workers.dev`.

7. **Custom domain (manual, owner-only step)**: attach `iuma.dev` to the Worker
   in the dashboard (Workers → iuma → Settings → Domains & Routes). This repo
   deliberately configures no routes. `.dev` is HSTS-preloaded, so the site is
   HTTPS-only; all generated URLs already use `https://iuma.dev`.

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
3. Policy: Allow → Include → Emails → your email (one-person policy).
4. After saving, open the application → **Overview** → copy the **Application
   Audience (AUD) Tag** → `wrangler secret put ADMIN_ACCESS_AUD`.
5. Set `ACCESS_TEAM_DOMAIN` in `wrangler.toml` to your team domain
   (`<team>.cloudflareaccess.com`).

Admin features: re-run today's pipeline, regenerate an entry or only its
illustration for any date, moderate the suggestion queue, edit the blocklist and
trend-source list (KV), inspect the last 50 cron log rows and the seed supply.

## Cost model (Workers AI free tier: 10,000 neurons/day)

**The core guarantee: user traffic never triggers an AI call.** Model calls
exist only under `src/pipeline/` and `src/ai/` (grep-able convention) and are
reached exclusively from the daily cron and explicit admin actions. Guessing,
suggesting, browsing, RSS, and OG images are pure D1/KV/R2 work.

| Daily pipeline step | Model                                      | Calls/day         | Est. neurons     |
| ------------------- | ------------------------------------------ | ----------------- | ---------------- |
| Pick & dedupe       | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 1                 | ~300             |
| Generate entry      | same (one retry max on bad JSON)           | 1–2               | ~1,500–3,000     |
| Illustration        | `@cf/black-forest-labs/flux-1-schnell`     | 1                 | ~50              |
| **Total**           |                                            | **3–4 + 1 image** | **~2,000–3,500** |

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
