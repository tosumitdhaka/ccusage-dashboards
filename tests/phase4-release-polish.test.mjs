import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("persistent header CSS properties are sticky with backdrop-filter blur and subtle border", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  // Check balanced braces in CSS
  const openCount = (css.match(/\{/g) || []).length;
  const closeCount = (css.match(/\}/g) || []).length;
  assert.equal(openCount, closeCount, "CSS brace balance check failed");

  // Verify sticky positioning on .topbar
  assert.match(
    css,
    /\.topbar\s*\{[^}]*position:\s*sticky/,
    "Expected .topbar to have position: sticky"
  );
  assert.match(
    css,
    /\.topbar\s*\{[^}]*top:\s*0/,
    "Expected .topbar to have top: 0"
  );
  assert.match(
    css,
    /\.topbar\s*\{[^}]*z-index:\s*100/,
    "Expected .topbar to have z-index: 100"
  );

  // Verify backdrop blur and background styling
  assert.match(
    css,
    /\.topbar\s*\{[^}]*backdrop-filter:\s*blur\(12px\)/,
    "Expected .topbar to have backdrop-filter: blur(12px)"
  );
  assert.match(
    css,
    /\.topbar\s*\{[^}]*-webkit-backdrop-filter:\s*blur\(12px\)/,
    "Expected .topbar to have -webkit-backdrop-filter: blur(12px)"
  );
  assert.match(
    css,
    /\.topbar\s*\{[^}]*background:\s*rgba\(12,\s*17,\s*28,\s*0\.88\)/,
    "Expected .topbar to have background: rgba(12, 17, 28, 0.88)"
  );
  assert.match(
    css,
    /\.topbar\s*\{[^}]*border-bottom:\s*1px solid var\(--color-border\)/,
    "Expected .topbar to have border-bottom: 1px solid var(--color-border)"
  );
});

test("period selector is present on .topbar with full synchronization in dashboard.ts and public/dashboard.js", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");

  // Verify HTML topbar includes period selector
  const topbarMatch = html.match(/<header class="topbar">([\s\S]*?)<\/header>/);
  assert.ok(topbarMatch, "Expected .topbar header in public/index.html");
  const topbarHtml = topbarMatch[1];

  assert.ok(topbarHtml.includes('id="header-period"'), "Missing #header-period select in .topbar");
  assert.ok(topbarHtml.includes('class="period-select header-period-select"'), "Expected .period-select and .header-period-select classes");
  assert.ok(topbarHtml.includes('value="daily"'), "Missing daily option in #header-period");
  assert.ok(topbarHtml.includes('value="weekly"'), "Missing weekly option in #header-period");
  assert.ok(topbarHtml.includes('value="monthly"'), "Missing monthly option in #header-period");
  assert.ok(topbarHtml.includes('value="hourly"'), "Missing hourly option in #header-period");

  // Verify event listeners and bidirectional synchronization in TypeScript and compiled JavaScript
  for (const [name, code] of [["dashboard.ts", ts], ["dashboard.js", js]]) {
    // Header select change updates state and triggers render
    assert.match(
      code,
      /header-period[\s\S]*?addEventListener\(["']change["']/,
      `${name} should wire change event listener on header-period`
    );

    // applyFilterState updates header-period select value
    assert.match(
      code,
      /headerPeriod\.value\s*=\s*state\.section/,
      `${name} should sync headerPeriod.value in applyFilterState / render`
    );

    // In-card .period buttons synchronize header-period select
    assert.match(
      code,
      /\.period[\s\S]*?headerPeriod\.value\s*=\s*state\.section/,
      `${name} should update header-period select when in-card period buttons are clicked`
    );
  }
});

test("dashboard-grid and card containers minimize widget gap for data density and alignment", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  // .dashboard-grid 12-column layout gap is minimized to 8px
  assert.match(
    css,
    /\.dashboard-grid\s*\{[^}]*gap:\s*8px/,
    "Expected .dashboard-grid to have gap: 8px"
  );

  // .kpis summary cards gap is minimized to 8px
  assert.match(
    css,
    /\.kpis\s*\{[^}]*gap:\s*8px/,
    "Expected .kpis to have gap: 8px"
  );

  // .panel-grid gap is minimized to 8px
  assert.match(
    css,
    /\.panel-grid\s*\{[^}]*gap:\s*8px/,
    "Expected .panel-grid to have gap: 8px"
  );

  // .token-grid gap is minimized to 8px
  assert.match(
    css,
    /\.token-grid\s*\{[^}]*gap:\s*8px/,
    "Expected .token-grid to have gap: 8px"
  );
});

test("layout editing controls streamline locked and unlocked button states", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");

  // HTML has the locked button labelled '🔒 Edit Layout'
  assert.ok(
    html.includes(">🔒 Edit Layout</button>"),
    "Expected #layout-edit button text to be '🔒 Edit Layout'"
  );
  assert.ok(
    html.includes('id="layout-save"'),
    "Expected #layout-save button to exist"
  );
  assert.ok(
    html.includes('id="layout-cancel"'),
    "Expected #layout-cancel button to exist"
  );
  assert.ok(
    html.includes(">✓ Save Layout</button>"),
    "Expected Save Layout button text"
  );
  assert.ok(
    html.includes(">✕ Cancel</button>"),
    "Expected Cancel button text with clear glyph"
  );

  // When arranging, the redundant 'Layout Unlocked' button is hidden
  for (const [name, code] of [["dashboard.ts", ts], ["dashboard.js", js]]) {
    assert.match(
      code,
      /\$\(["']layout-edit["']\)\.hidden\s*=\s*arranging/,
      `${name} should set layout-edit.hidden = arranging`
    );
    assert.match(
      code,
      /\$\(["']layout-save["']\)\.hidden\s*=\s*!arranging/,
      `${name} should show layout-save only when arranging`
    );
    assert.match(
      code,
      /\$\(["']layout-cancel["']\)\.hidden\s*=\s*!arranging/,
      `${name} should show layout-cancel only when arranging`
    );
  }
});

test("unified customize and layout editor integrates metadata, widget toggling, and settings", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  // HTML includes unified layout toolbar above the grid
  assert.ok(html.includes('id="layout-toolbar"'), "Missing #layout-toolbar region");
  assert.ok(html.includes('id="layout-title-input"'), "Missing #layout-title-input in layout toolbar");
  assert.ok(html.includes('id="layout-widget-chips"'), "Missing #layout-widget-chips in layout toolbar");
  assert.ok(html.includes('id="layout-toolbar-save"'), "Missing #layout-toolbar-save in layout toolbar");
  assert.ok(html.includes('id="layout-toolbar-cancel"'), "Missing #layout-toolbar-cancel in layout toolbar");
  assert.ok(html.includes('id="customize-edit-layout"'), "Missing #customize-edit-layout bridge button in customize dialog");

  // CSS rules for unified layout toolbar
  assert.ok(css.includes(".layout-toolbar-panel"), "Expected .layout-toolbar-panel styling");
  assert.ok(css.includes(".layout-widget-chip"), "Expected .layout-widget-chip styling");

  // Controller functions for unified layout editing
  for (const [name, code] of [["dashboard.ts", ts], ["dashboard.js", js]]) {
    assert.match(code, /populateLayoutToolbar/, `${name} should define populateLayoutToolbar`);
    assert.match(code, /toggleLayoutWidget/, `${name} should define toggleLayoutWidget`);
    assert.match(code, /customize-edit-layout/, `${name} should wire customize-edit-layout bridge`);
  }
});
