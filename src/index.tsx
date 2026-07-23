/**
 * slangbot — single Worker entrypoint: Hono app (fetch) + daily cron (scheduled).
 *
 * COST GUARANTEE: no route in this app calls Workers AI. Model calls exist
 * only under src/pipeline/ and src/ai/, reached from `scheduled` and the
 * Access-protected admin actions.
 */
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Env } from "./env.ts";
import { pages, render404 } from "./routes/pages.tsx";
import { api } from "./routes/api.ts";
import { img } from "./routes/img.ts";
import { og } from "./routes/og.tsx";
import { feeds } from "./routes/feeds.ts";
import { admin } from "./routes/admin.tsx";
import { runDailyPipeline } from "./pipeline/run.ts";
import { logCron } from "./lib/d1.ts";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  secureHeaders({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://challenges.cloudflare.com"],
      frameSrc: ["https://challenges.cloudflare.com"],
    },
  }),
);

app.route("/", admin);
app.route("/", api);
app.route("/", img);
app.route("/", og);
app.route("/", feeds);
app.route("/", pages);

app.notFound((c) => {
  const locale = c.req.path.startsWith("/ru") ? "ru" : "en";
  return render404(locale, c.req.path);
});

export default {
  fetch: app.fetch,

  scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      runDailyPipeline(env).catch(async (e) => {
        console.error("daily pipeline failed:", e);
        try {
          await logCron(env.DB, "pipeline", "error", String(e));
        } catch {
          // D1 unavailable — nothing more we can do here
        }
      }),
    );
  },
};
