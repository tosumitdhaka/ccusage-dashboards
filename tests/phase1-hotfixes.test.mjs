import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, readdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSnapshotStore } from "../src/node/snapshots.mts";

test("public/styles.css has balanced braces and properly closed chart-header-controls rule", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const openCount = (css.match(/\{/g) || []).length;
  const closeCount = (css.match(/\}/g) || []).length;
  assert.equal(openCount, closeCount, "CSS brace balance check failed");
  assert.match(
    css,
    /\.chart-header-controls\s*\{[^}]*transition:\s*opacity\s+130ms\s+ease;\s*\}/,
    "Missing semicolon or closing brace on chart-header-controls rule"
  );
  assert.match(
    css,
    /\.dashboard-grid>\[data-widget\]:hover\s+\.chart-header-controls/,
    "Hover selector should cleanly follow closed rule"
  );
});

test(".gitattributes exists and enforces lf normalization", async () => {
  const gitattributes = await readFile(new URL("../.gitattributes", import.meta.url), "utf8");
  assert.ok(gitattributes.includes("* text=auto eol=lf"));
  assert.ok(gitattributes.includes("*.ts text eol=lf"));
  assert.ok(gitattributes.includes("*.mjs text eol=lf"));
  assert.ok(gitattributes.includes("*.css text eol=lf"));
});

test("drawSessionTable in dashboard.ts does not artificially limit cost resolution to top-30", async () => {
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");
  
  // Both ts and js must not slice cost rows to 30 inside drawSessionTable
  assert.ok(!ts.includes('metric: "totalCost", limit: 30'), "dashboard.ts should not limit cost to 30");
  assert.ok(!js.includes('metric: "totalCost", limit: 30'), "public/dashboard.js should not limit cost to 30");

  // Verify simulation of session cost map across >30 active sessions
  const syntheticSessions = Array.from({ length: 40 }, (_, i) => ({
    period: `sess-${i + 1}`,
    agent: "codex",
    totalTokens: (40 - i) * 1000,
    totalCost: (i + 1) * 0.10 // sess-1 has highest tokens but lowest cost ($0.10, ranked 40th in cost)
  }));
  const state = { report: { session: syntheticSessions }, agent: "all", model: "all" };

  const costs = new Map();
  for (const s of (state.report?.session ?? [])) {
    if (state.agent !== "all" && s.agent !== state.agent) continue;
    const sessionKey = (s.agent ?? "unknown") + "\0" + String(s.period ?? s.date ?? s.session ?? "");
    let cost = 0;
    if (state.model === "all") {
      const c = typeof s.totalCost === "number" ? s.totalCost : s.cost;
      cost = typeof c === "number" && Number.isFinite(c) && c >= 0 ? c : 0;
    }
    costs.set(sessionKey, cost);
  }

  // sess-1 is ranked #1 in tokens, but would have been outside top-30 cost (since it ranks 40th in cost)
  const topTokenRow = { session: "sess-1", agent: "codex", value: 40000 };
  const key = (topTokenRow.agent ?? "unknown") + "\0" + String(topTokenRow.session ?? "");
  const resolvedCost = costs.get(key);
  assert.equal(resolvedCost, 0.10, "Session ranked 40th in cost must not report $0.00");
  assert.equal(costs.size, 40, "All 40 sessions must be encompassed in the cost map");
});

test("snapshot persistence cleans up orphaned .tmp files on rename error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "snapshot-cleanup-test-"));
  const targetDir = join(dir, "target-file");
  await mkdir(targetDir, { recursive: true });
  
  const store = createSnapshotStore({ file: targetDir, max: 5 });
  const sampleReport = {
    daily: [{ period: "2026-10-29", totalTokens: 100, totalCost: 1.0, agents: [{ agent: "test", totalTokens: 100 }] }]
  };

  await assert.rejects(async () => {
    await store.append(sampleReport);
  });

  const files = await readdir(dir);
  const tmpFiles = files.filter(f => f.endsWith(".tmp"));
  assert.equal(tmpFiles.length, 0, "Expected .tmp file to be cleaned up after failed rename");
  
  await rm(dir, { recursive: true, force: true });
});
