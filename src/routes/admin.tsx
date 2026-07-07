/**
 * Admin panel — behind Cloudflare Access. Every request verifies the
 * Cf-Access-Jwt-Assertion JWT (signature + aud); header presence alone is
 * never trusted. Server-rendered React, plain full-page POST forms.
 */
import { Hono } from "hono";
import type { Env } from "../env.ts";
import { kvCachedKeyFetcher, verifyAccessJwt } from "../lib/access-jwt.ts";
import {
  countSuggestions,
  countUnusedSeedTerms,
  listSuggestions,
  recentCronLog,
  setSuggestionStatus,
} from "../lib/d1.ts";
import {
  DEFAULT_BLOCKLIST,
  DEFAULT_SOURCES,
  getBlocklist,
  getSources,
  KV_KEYS,
} from "../lib/kv.ts";
import { runDailyPipeline } from "../pipeline/run.ts";
import { renderPage } from "./render.tsx";
import { SITE_NAME } from "../config.ts";

export const admin = new Hono<{ Bindings: Env }>();

admin.use("/admin/*", async (c, next) => {
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  const claims = await verifyAccessJwt(token, {
    aud: c.env.ADMIN_ACCESS_AUD,
    getKeys: kvCachedKeyFetcher(c.env.KV, c.env.ACCESS_TEAM_DOMAIN),
  });
  if (!claims) return c.text("Forbidden", 403);
  await next();
});

function AdminShell(props: { title: string; children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{props.title}</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body className="admin">
        <main className="main admin-main">
          <h1 className="page-title">{SITE_NAME} admin</h1>
          {props.children}
          <p>
            <a href="/admin">← dashboard</a>
          </p>
        </main>
      </body>
    </html>
  );
}

admin.get("/admin", async (c) => {
  const [logs, pending, seedSupply, blocklist, sources] = await Promise.all([
    recentCronLog(c.env.DB, 50),
    listSuggestions(c.env.DB, "new"),
    countUnusedSeedTerms(c.env.DB),
    getBlocklist(c.env.KV),
    getSources(c.env.KV),
  ]);
  const approvedCount = await countSuggestions(c.env.DB, "approved");

  return await renderPage(
    <AdminShell title={`${SITE_NAME} admin`}>
      <section className="admin-section">
        <h2>pipeline</h2>
        <p>
          seed supply remaining: {seedSupply} · approved suggestions:{" "}
          {approvedCount}
        </p>
        <form method="post" action="/admin/run" className="admin-inline">
          <button type="submit">re-run today's pipeline</button>
        </form>
        <form method="post" action="/admin/regenerate" className="admin-inline">
          <label>
            date <input type="date" name="date" required />
          </label>
          <label>
            <input type="checkbox" name="imageOnly" value="1" />{" "}
            illustration only
          </label>
          <button type="submit">regenerate</button>
        </form>
      </section>

      <section className="admin-section">
        <h2>suggestion queue ({pending.length} new)</h2>
        <table className="admin-table">
          <tbody>
            {pending.map((s) => (
              <tr key={s.id}>
                <td>{s.term}</td>
                <td className="mono">{s.created_at}</td>
                <td>
                  <form
                    method="post"
                    action="/admin/suggestion"
                    className="admin-inline"
                  >
                    <input type="hidden" name="id" value={s.id} />
                    <button name="action" value="approved" type="submit">
                      approve
                    </button>
                    <button name="action" value="rejected" type="submit">
                      reject
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="admin-section">
        <h2>blocklist (one entry per line)</h2>
        <form method="post" action="/admin/blocklist">
          <textarea
            name="blocklist"
            rows={8}
            defaultValue={blocklist.join("\n")}
          >
          </textarea>
          <button type="submit">save blocklist</button>
        </form>
      </section>

      <section className="admin-section">
        <h2>trend sources (JSON)</h2>
        <form method="post" action="/admin/sources">
          <textarea
            name="sources"
            rows={8}
            defaultValue={JSON.stringify(sources, null, 2)}
          >
          </textarea>
          <button type="submit">save sources</button>
        </form>
      </section>

      <section className="admin-section">
        <h2>last {logs.length} cron log entries</h2>
        <table className="admin-table mono">
          <tbody>
            {logs.map((l) => (
              <tr
                key={l.id}
                className={l.status === "error" ? "log-error" : undefined}
              >
                <td>{l.run_at}</td>
                <td>{l.step}</td>
                <td>{l.status}</td>
                <td>{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>,
    { headers: { "Cache-Control": "no-store" } },
  );
});

/**
 * Callers scripting the trigger (e.g. `curl` from a WARP-connected machine,
 * authenticated the same way a browser session would be) send
 * `Accept: application/json` or `?format=json` to get a scriptable response
 * instead of the admin HTML page.
 */
function wantsJson(
  c: {
    req: {
      header(n: string): string | undefined;
      query(n: string): string | undefined;
    };
  },
): boolean {
  return c.req.query("format") === "json" ||
    (c.req.header("accept") ?? "").includes("application/json");
}

admin.post("/admin/run", async (c) => {
  try {
    const msg = await runDailyPipeline(c.env, { force: true });
    if (wantsJson(c)) return c.json({ ok: true, message: msg });
    return await renderPage(
      <AdminShell title="pipeline run">
        <p>{msg}</p>
      </AdminShell>,
    );
  } catch (e) {
    if (wantsJson(c)) return c.json({ ok: false, error: String(e) }, 500);
    return await renderPage(
      <AdminShell title="pipeline run">
        <p>pipeline failed: {String(e)}</p>
      </AdminShell>,
      { status: 500 },
    );
  }
});

admin.post("/admin/regenerate", async (c) => {
  const form = await c.req.formData();
  const date = String(form.get("date") ?? "");
  const imageOnly = form.get("imageOnly") === "1";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    if (wantsJson(c)) return c.json({ ok: false, error: "bad date" }, 400);
    return c.text("bad date", 400);
  }
  try {
    const msg = await runDailyPipeline(c.env, { date, force: true, imageOnly });
    if (wantsJson(c)) return c.json({ ok: true, message: msg });
    return await renderPage(
      <AdminShell title="regenerate">
        <p>{msg}</p>
      </AdminShell>,
    );
  } catch (e) {
    if (wantsJson(c)) return c.json({ ok: false, error: String(e) }, 500);
    return await renderPage(
      <AdminShell title="regenerate">
        <p>failed: {String(e)}</p>
      </AdminShell>,
      { status: 500 },
    );
  }
});

admin.post("/admin/suggestion", async (c) => {
  const form = await c.req.formData();
  const id = parseInt(String(form.get("id") ?? ""), 10);
  const action = String(form.get("action") ?? "");
  if (!Number.isInteger(id) || !["approved", "rejected"].includes(action)) {
    return c.text("bad request", 400);
  }
  await setSuggestionStatus(c.env.DB, id, action as "approved" | "rejected");
  return c.redirect("/admin", 303);
});

admin.post("/admin/blocklist", async (c) => {
  const form = await c.req.formData();
  const value = String(form.get("blocklist") ?? DEFAULT_BLOCKLIST.join("\n"))
    .slice(0, 20000);
  await c.env.KV.put(KV_KEYS.blocklist, value);
  return c.redirect("/admin", 303);
});

admin.post("/admin/sources", async (c) => {
  const form = await c.req.formData();
  const raw = String(form.get("sources") ?? "").slice(0, 20000);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    await c.env.KV.put(KV_KEYS.sources, JSON.stringify(parsed));
  } catch {
    await c.env.KV.put(KV_KEYS.sources, JSON.stringify(DEFAULT_SOURCES));
  }
  return c.redirect("/admin", 303);
});
