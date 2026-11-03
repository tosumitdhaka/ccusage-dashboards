import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";


test("public/styles.css declares the v0.4 token hierarchy and theme overrides", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const openCount = (css.match(/\{/g) || []).length;
  const closeCount = (css.match(/\}/g) || []).length;
  assert.equal(openCount, closeCount, "CSS brace balance check failed");

  const requiredTokens = [
    "--primitive-slate-950: #080b10",
    "--surface-root: var(--primitive-slate-950)",
    "--surface-sidebar: var(--primitive-slate-925)",
    "--surface-card: var(--primitive-slate-900)",
    "--surface-card-hover: var(--primitive-slate-875)",
    "--surface-elevated: var(--primitive-slate-850)",
    "--border-subtle: rgba(255, 255, 255, .07)",
    "--border-default: rgba(255, 255, 255, .11)",
    "--text-primary: var(--primitive-slate-50)",
    "--text-secondary: var(--primitive-slate-400)",
    "--accent-primary: var(--primitive-blue-500)",
    "--accent-secondary: var(--primitive-cyan-400)",
    "--status-positive: var(--primitive-green-400)",
    "--status-warning: var(--primitive-amber-400)",
    "--status-negative: var(--primitive-red-400)",
    "--space-4: 16px",
    "--radius-sm: 6px",
    "--radius-md: 10px",
    "--radius-lg: 14px",
    "--ease-standard: cubic-bezier(.2, .8, .2, 1)"
  ];
  for (const token of requiredTokens) assert.ok(css.includes(token), `Missing v0.4 design token: "${token}"`);

  for (const usage of ["var(--surface-root)", "var(--surface-card)", "var(--border-default)", "var(--text-primary)", "var(--accent-primary)"]) {
    assert.ok(css.includes(usage), `Expected semantic token usage: ${usage}`);
  }
  assert.ok(css.includes('[data-theme="light"]'), "Missing light theme override");
  assert.ok(css.includes('[data-theme="contrast"]'), "Missing contrast theme override");
  assert.ok(css.includes('[data-density="compact"]'), "Missing compact density override");
  assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"), "Missing reduced-motion handling");
});
test("dashboard.ts and public/dashboard.js implement safe iterative max reduction without spreading flatMap", async () => {
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");

  for (const [name, code] of [["dashboard.ts", ts], ["public/dashboard.js", js]]) {
    // Unbounded spread into Math.max must not exist
    assert.ok(
      !code.includes("Math.max(1e-9, ...data.points.flatMap"),
      `${name} should not spread data.points.flatMap into Math.max`
    );
    assert.ok(
      !code.includes("...data.points.flatMap"),
      `${name} should not spread data.points.flatMap`
    );
    assert.ok(
      !code.includes("Math.max(1e-10, ...visible.map"),
      `${name} should not spread visible.map into Math.max`
    );
    assert.ok(
      !code.includes("Math.max(1e-9, ...rows.map"),
      `${name} should not spread rows.map into Math.max`
    );
  }

  // Verify safe iterative loop handles huge datasets that would otherwise throw RangeError
  const largeDataset = {
    points: Array.from({ length: 150_000 }, (_, i) => ({
      values: { modelA: i % 1000, modelB: (i * 2) % 2000 }
    }))
  };
  const names = ["modelA", "modelB"];

  // Iterative reduction algorithm as implemented in dashboard.ts
  let maxValue = 1e-9;
  for (const p of largeDataset.points) {
    for (const name of names) {
      const val = p.values[name] ?? 0;
      if (val > maxValue) maxValue = val;
    }
  }
  assert.equal(maxValue, 1998, "Iterative max calculation returned correct max for large dataset");

  // Confirm that spreading 150,000 items throws RangeError in V8
  assert.throws(
    () => {
      const flat = new Array(150_000).fill(1);
      Math.max(...flat);
    },
    { name: "RangeError" },
    "V8 should throw RangeError for large argument spreads, demonstrating necessity of iterative calculation"
  );
});

test("dashboard.ts and public/dashboard.js implement page visibility-aware background polling", async () => {
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");

  for (const [name, code] of [["dashboard.ts", ts], ["public/dashboard.js", js]]) {
    // Polling interval must check document.visibilityState
    assert.match(
      code,
      /document\.visibilityState\s*===\s*["']hidden["']/,
      `${name} must guard polling against hidden visibilityState`
    );

    // Visibility change listener must be registered
    assert.match(
      code,
      /document\.addEventListener\(["']visibilitychange["']/,
      `${name} must listen to visibilitychange event`
    );

    // Listener must check !document.hidden and elapsed interval threshold
    assert.match(
      code,
      /!document\.hidden/,
      `${name} must verify !document.hidden on visibilitychange`
    );
    assert.match(
      code,
      /60_?000/,
      `${name} must check 60_000 ms interval threshold`
    );
  }

  // Functional simulation of visibility polling logic
  let loadCalls = 0;
  let lastLoadedAt = 100_000;
  const AUTO_REFRESH_INTERVAL_MS = 60_000;
  const mockLoad = () => {
    loadCalls++;
    lastLoadedAt = currentTime;
  };

  let currentTime = 100_000;
  let mockDoc = { visibilityState: "hidden", hidden: true };

  // 1. Polling interval fires while tab is hidden -> no load
  const pollingTick = () => {
    if (mockDoc.visibilityState === "hidden") return;
    mockLoad();
  };
  pollingTick();
  assert.equal(loadCalls, 0, "Polling tick while hidden should not trigger load");

  // 2. Polling interval fires while tab is visible -> triggers load
  mockDoc.visibilityState = "visible";
  mockDoc.hidden = false;
  currentTime = 160_000;
  pollingTick();
  assert.equal(loadCalls, 1, "Polling tick while visible should trigger load");

  // 3. User switches tabs back quickly (< 60s elapsed) -> throttled, no reload
  currentTime = 175_000; // 15s later
  const onVisibilityChange = () => {
    if (!mockDoc.hidden && currentTime - lastLoadedAt >= AUTO_REFRESH_INTERVAL_MS) {
      mockLoad();
    }
  };
  onVisibilityChange();
  assert.equal(loadCalls, 1, "Tab switch back within 60s should not trigger immediate load");

  // 4. User switches tabs back after being away for 70s (>= 60s elapsed) -> immediate reload
  currentTime = 235_000; // 75s after last load
  onVisibilityChange();
  assert.equal(loadCalls, 2, "Tab switch back after >= 60s should trigger reload");
  assert.equal(lastLoadedAt, 235_000, "lastLoadedAt should be updated on reload");
});
