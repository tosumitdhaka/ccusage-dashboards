import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectUsage, reportArgs } from "./ccusage-adapter.mjs";
export { reportArgs } from "./ccusage-adapter.mjs";
import { createSnapshotStore, createMemorySnapshotStore } from "./snapshots.mjs";

const DIR = dirname(fileURLToPath(import.meta.url));
const ASSETS = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/dashboard.js", ["dashboard.js", "text/javascript; charset=utf-8"]],
  ["/normalize.mjs", ["normalize.mjs", "text/javascript; charset=utf-8"]],
  ["/analytics.mjs", ["analytics.mjs", "text/javascript; charset=utf-8"]],
  ["/widget-registry.mjs", ["widget-registry.mjs", "text/javascript; charset=utf-8"]],
  ["/dashboard-config.mjs", ["dashboard-config.mjs", "text/javascript; charset=utf-8"]],
  ["/chart-presentation.mjs", ["chart-presentation.mjs", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]
]);

export async function collectLive() {
  return collectUsage({ args: reportArgs() });
}

export function createDashboardServer({ collect = collectLive, cacheMs = 45_000, snapshots } = {}) {
  const history = snapshots ?? (collect === collectLive ? createSnapshotStore() : createMemorySnapshotStore());
  let latest = null;
  let loadedAt = 0;
  let pending = null;
  async function getUsage() {
    if (latest && Date.now() - loadedAt < cacheMs) return latest;
    if (!pending) {
      pending = Promise.resolve().then(collect).then(async (data) => {
        if (!data || !Array.isArray(data.daily)) throw new Error("Invalid ccusage report.");
        // Recording is best-effort: a storage issue must not hide live data.
        try { await history.append(data); } catch (e) { console.error("[dashboard] Failed to save observation:", e.message); }
        latest = data;
        loadedAt = Date.now();
        return data;
      }).finally(() => { pending = null; });
    }
    return pending;
  }

  return createServer(async (req, res) => {
    // Localhost-only AND validate Host to prevent DNS-rebinding reads of logs.
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? "")) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" }).end("Method not allowed");
      return;
    }
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname === "/api/hourly") {
      try {
        await getUsage();
        const observations = await history.read();
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ observations, kind: "sampled-observations" }));
      } catch (error) {
        res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Hourly data unavailable." }));
      }
      return;
    }
    if (pathname === "/api/usage") {
      try {
        const report = await getUsage();
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(report));
      } catch (error) {
        res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Usage unavailable." }));
      }
      return;
    }
    const asset = ASSETS.get(pathname);
    if (!asset) {
      res.writeHead(404).end("Not found");
      return;
    }
    try {
      const bytes = await readFile(resolve(DIR, "public", asset[0]));
      res.writeHead(200, { "Content-Type": asset[1] });
      res.end(bytes);
    } catch {
      res.writeHead(500).end("Dashboard asset unavailable");
    }
  });
}

export async function startDashboardServer({ port = Number(process.env.PORT ?? 4177), collect = collectLive } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT must be between 0 and 65535.");
  const server = createDashboardServer({ collect });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolvePromise);
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startDashboardServer().then((server) => {
    const { port } = server.address();
    console.log("AI Usage Observatory: http://127.0.0.1:" + port);
    console.log("One process only: the dashboard invokes ccusage automatically when usage data is requested.");
    console.log("Using official ccusage npm dependency (run npm install once).");
    console.log(process.env.CCUSAGE_OFFLINE === "1" ? "Pricing: offline (embedded model catalog)." : "Pricing: online refresh from public catalogs; use CCUSAGE_OFFLINE=1 to disable.");
  }).catch((err) => { console.error(err.message); process.exitCode = 1; });
}
