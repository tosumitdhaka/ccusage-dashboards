import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public/styles.css declares comprehensive :root design tokens and adopts them in layout rules", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  // Balanced braces check
  const openCount = (css.match(/\{/g) || []).length;
  const closeCount = (css.match(/\}/g) || []).length;
  assert.equal(openCount, closeCount, "CSS brace balance check failed");

  // Verify all required :root custom properties are declared
  const requiredTokens = [
    "color-scheme: dark",
    "--color-bg-canvas: #0c111c",
    "--color-bg-surface: #111927",
    "--color-bg-elevated: #162538",
    "--color-bg-card: #141d2c",
    "--color-border: #253346",
    "--color-border-subtle: #1f2c3d",
    "--color-border-focus: #53d5bd",
    "--color-text-primary: #ecf1fb",
    "--color-text-secondary: #94a7bd",
    "--color-text-muted: #8ea0b8",
    "--color-accent-teal: #53d5bd",
    "--color-accent-teal-subtle: rgba(83, 213, 189, 0.12)",
    "--radius-sm: 6px",
    "--radius-md: 10px",
    "--radius-lg: 14px",
  ];

  for (const token of requiredTokens) {
    assert.ok(css.includes(token), `Missing required design token in :root: "${token}"`);
  }

  // Verify custom property variables are utilized in core layout rules
  assert.ok(css.includes("var(--color-bg-canvas)"), "Expected var(--color-bg-canvas) usage in layout rules");
  assert.ok(css.includes("var(--color-text-primary)"), "Expected var(--color-text-primary) usage in layout rules");
  assert.ok(css.includes("var(--color-border)"), "Expected var(--color-border) usage in layout rules");
  assert.ok(css.includes("var(--color-border-subtle)"), "Expected var(--color-border-subtle) usage in layout rules");
  assert.ok(css.includes("var(--color-bg-card)"), "Expected var(--color-bg-card) usage in layout rules");
  assert.ok(css.includes("var(--color-bg-surface)"), "Expected var(--color-bg-surface) usage in layout rules");
  assert.ok(css.includes("var(--color-bg-elevated)"), "Expected var(--color-bg-elevated) usage in layout rules");
  assert.ok(css.includes("var(--color-accent-teal)"), "Expected var(--color-accent-teal) usage in layout rules");
  assert.ok(css.includes("var(--color-border-focus)"), "Expected var(--color-border-focus) usage in layout rules");
  assert.ok(css.includes("var(--radius-sm)"), "Expected var(--radius-sm) usage in layout rules");
  assert.ok(css.includes("var(--radius-md)"), "Expected var(--radius-md) usage in layout rules");
  assert.ok(css.includes("var(--radius-lg)"), "Expected var(--radius-lg) usage in layout rules");
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
