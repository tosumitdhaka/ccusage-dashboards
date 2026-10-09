import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { reportArgs, startDashboardServer } from "./server.mjs";

async function withServer(collect, run) {
  const server = await startDashboardServer({ port: 0, collect });
  try {
    const { port } = server.address();
    await run("http://127.0.0.1:" + port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("serves a cached unified report locally without remote CORS grants", async () => {
  let calls = 0;
  await withServer(async () => { calls++; return { daily: [], totals: {} }; }, async (url) => {
    const first = await fetch(url + "/api/usage");
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { daily: [], totals: {} });
    assert.equal(first.headers.get("access-control-allow-origin"), null);
    assert.match(first.headers.get("content-security-policy"), /default-src 'self'/);
    const second = await fetch(url + "/api/usage");
    assert.equal(second.status, 200);
    assert.equal(calls, 1);
    const html = await fetch(url + "/");
    assert.equal(html.status, 200);
    assert.match(await html.text(), /AI Usage Observatory/);
    assert.equal((await fetch(url + "/../../server.mjs")).status, 404);
  });
});

test("does not expose private data to non-localhost Host headers", async () => {
  await withServer(async () => ({ daily: [] }), async (url) => {
    const target = new URL(url);
    const status = await new Promise((resolve, reject) => {
      const req = request({ hostname: target.hostname, port: target.port, path: "/api/usage", headers: { Host: "evil.example" } }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 403);
  });
});

test("returns an honest error rather than invented usage when CLI fails", async () => {
  await withServer(async () => { throw new Error("No report"); }, async (url) => {
    const res = await fetch(url + "/api/usage");
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /No report/);
  });
});

test("dashboard uses live pricing by default, offline only on explicit opt-out", () => {
  const standard = reportArgs({ offline: false });
  assert.ok(standard.includes("--json"));
  assert.ok(standard.includes("--by-agent"));
  assert.equal(standard.includes("--offline"), false);
  assert.deepEqual(reportArgs({ offline: true }), [...standard, "--offline"]);
  assert.equal(standard.includes("--offline"), false);
});

test("hourly endpoint and analytic module remain localhost-only", async () => {
  await withServer(async () => ({
    daily: [{ agent: "all", period: "2026-10-09", totalTokens: 100, totalCost: 1 }]
  }), async (url) => {
    const history = await fetch(url + "/api/hourly");
    assert.equal(history.status, 200);
    const json = await history.json();
    assert.equal(json.kind, "sampled-observations");
    assert.equal(json.observations.length, 1);
    const module = await fetch(url + "/analytics.mjs");
    assert.equal(module.status, 200);
    assert.match(await module.text(), /buildObservedHourly/);
  });
});
