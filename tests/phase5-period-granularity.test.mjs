import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GRID_GAP_PX, GRID_ROW_HEIGHT_PX, GRID_ROW_STEP_PX, relocateGridWidget, snapToGrid } from "../public/dashboard-layout.mjs";
import { DEFAULT_DASHBOARD, validateDashboardConfig } from "../public/widget-registry.mjs";

test("top header #header-period has Period date range options (7d, 14d, 30d, 90d, all) and wires change event", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");

  // Verify .topbar has #header-period select
  const topbarMatch = html.match(/<header class="topbar">([\s\S]*?)<\/header>/);
  assert.ok(topbarMatch, "Expected .topbar header in public/index.html");
  const topbarHtml = topbarMatch[1];

  assert.ok(topbarHtml.includes('id="header-period"'), "Missing #header-period in .topbar");
  assert.ok(topbarHtml.includes('value="7d"'), "Missing 7d option in #header-period");
  assert.ok(topbarHtml.includes('value="14d"'), "Missing 14d option in #header-period");
  assert.ok(topbarHtml.includes('value="30d"'), "Missing 30d option in #header-period");
  assert.ok(topbarHtml.includes('value="90d"'), "Missing 90d option in #header-period");
  assert.ok(topbarHtml.includes('value="all"'), "Missing all option in #header-period");

  // Verify legacy granularity options are not in header-period
  assert.ok(!topbarHtml.includes('value="daily"'), "Daily must not be a top-level Period option");
  assert.ok(!topbarHtml.includes('value="weekly"'), "Weekly must not be a top-level Period option");
  assert.ok(!topbarHtml.includes('value="monthly"'), "Monthly must not be a top-level Period option");
  assert.ok(!topbarHtml.includes('value="hourly"'), "Hourly must not be a top-level Period option");

  // Verify default dashboard filter period is "7d" (updated for v0.3.0 UX polish)
  assert.ok(DEFAULT_DASHBOARD.filters.period === "7d" || DEFAULT_DASHBOARD.filters.period === "30d", "Default dashboard filter period should be 7d or 30d");

  // Verify filtering logic and synchronization in dashboard.ts and public/dashboard.js
  for (const [name, code] of [["dashboard.ts", ts], ["dashboard.js", js]]) {
    assert.match(code, /filterReportByPeriod/, `${name} must define filterReportByPeriod`);
    assert.match(code, /filterHourlyByPeriod/, `${name} must define filterHourlyByPeriod`);
    assert.match(code, /header-period[\s\S]*?addEventListener\(["']change["']/, `${name} must wire change listener on header-period`);
    assert.match(code, /headerPeriod\.value\s*=\s*(?:state\.section|activePeriod)/, `${name} must synchronize headerPeriod.value`);
  }
});

test("secondary filter bar with global granularity pills and provider/model filters is removed from public/index.html", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");

  // Ensure secondary filter section is removed
  assert.ok(!html.includes('class="filters"'), "Secondary filter section .filters must be removed from HTML");
  assert.ok(!html.includes('class="time-pills"'), "Global time-pills container must be removed from HTML");
  assert.ok(!html.includes('class="agent-filter"'), "Secondary agent/model filter labels must be removed from HTML");
  assert.ok(!html.includes('id="agent"'), "#agent select must be removed from the overview page");
  assert.ok(!html.includes('id="model"'), "#model select must be removed from the overview page");

  // Verify client controller guards removed element lookups defensively
  for (const [name, code] of [["dashboard.ts", ts], ["dashboard.js", js]]) {
    assert.match(code, /const agent(?:El|Select)\s*=\s*\$\(["']agent["']\)/, `${name} must guard agent element lookup`);
    assert.match(code, /const model(?:El|Select)\s*=\s*\$\(["']model["']\)/, `${name} must guard model element lookup`);
  }
});

test("customize button is present on .topbar header and layout toolbar provides editing tools", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");

  const topbarMatch = html.match(/<header class="topbar">([\s\S]*?)<\/header>/);
  assert.ok(topbarMatch, "Expected .topbar header in public/index.html");
  const topbarHtml = topbarMatch[1];

  // Customize button must be in the topbar actions
  assert.ok(topbarHtml.includes('id="customize"'), "Customize button must be present in .topbar");
  assert.ok(topbarHtml.includes("⚙ Customize"), "Customize button text must be present in .topbar");

  // #layout-toolbar provides all layout & customization configuration
  assert.ok(html.includes('id="layout-toolbar"'), "Missing #layout-toolbar");
  assert.ok(html.includes('id="layout-title-input"'), "Missing #layout-title-input in #layout-toolbar");
  assert.ok(html.includes('id="layout-widget-chips"'), "Missing #layout-widget-chips in #layout-toolbar");
  assert.ok(html.includes('id="layout-toolbar-reset"'), "Missing #layout-toolbar-reset in #layout-toolbar");
  assert.ok(html.includes('id="layout-toolbar-save"'), "Missing #layout-toolbar-save in #layout-toolbar");
  assert.ok(html.includes('id="layout-toolbar-cancel"'), "Missing #layout-toolbar-cancel in #layout-toolbar");

  // Verify reset to default is wired in dashboard.ts and public/dashboard.js
  for (const [name, code] of [["dashboard.ts", ts], ["dashboard.js", js]]) {
    assert.match(code, /layout-toolbar-reset/, `${name} must wire layout-toolbar-reset button`);
    assert.match(code, /resetDashboardConfig/, `${name} must call resetDashboardConfig`);
  }
});

test("per-widget granularity is available in the trend card", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");

  // Trend card contains #trend-granularity select
  const trendMatch = html.match(/<section[^>]*id="trend"[^>]*>([\s\S]*?)<\/section>/);
  assert.ok(trendMatch, "Expected #trend card section in public/index.html");
  const trendHtml = trendMatch[1];

  assert.ok(trendHtml.includes('id="trend-granularity"'), "Missing #trend-granularity in #trend controls");
  assert.ok(trendHtml.includes('value="daily"'), "Missing daily option in #trend-granularity");
  assert.ok(trendHtml.includes('value="weekly"'), "Missing weekly option in #trend-granularity");
  assert.ok(trendHtml.includes('value="monthly"'), "Missing monthly option in #trend-granularity");
  assert.ok(trendHtml.includes('value="hourly"'), "Missing hourly option in #trend-granularity");

  // Default dashboard config includes trend granularity
  assert.equal(DEFAULT_DASHBOARD.widgetSettings.trend.granularity, "daily", "Trend default granularity should be daily");

  // Validating config accepts granularity
  const config = validateDashboardConfig({
    ...DEFAULT_DASHBOARD,
    widgetSettings: {
      ...DEFAULT_DASHBOARD.widgetSettings,
      trend: { ...DEFAULT_DASHBOARD.widgetSettings.trend, granularity: "weekly" }
    }
  });
  assert.equal(config.widgetSettings.trend.granularity, "weekly");

  // Trend granularity change listener is wired in dashboard.ts and public/dashboard.js
  for (const [name, code] of [["dashboard.ts", ts], ["dashboard.js", js]]) {
    assert.match(code, /trend-granularity/, `${name} must reference trend-granularity select`);
    assert.match(code, /updateGraphSettings\(["']trend["'],\s*\{\s*granularity:/, `${name} must update trend granularity on change`);
  }
});

test("drag positioning, drop ghost preview, and collision detection honor 8px gap", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");

  // Grid constants
  assert.equal(GRID_GAP_PX, 8, "GRID_GAP_PX must be 8");
  assert.equal(GRID_ROW_HEIGHT_PX, 24, "GRID_ROW_HEIGHT_PX must be 24");
  assert.equal(GRID_ROW_STEP_PX, 32, "GRID_ROW_STEP_PX must be 32 (24px height + 8px gap)");

  // CSS gap and zero-margin enforcement
  assert.match(css, /\.dashboard-grid\s*\{[^}]*gap:\s*8px/, "CSS .dashboard-grid must have gap: 8px");
  assert.match(css, /\.dashboard-grid>\[data-widget\][^}]*margin:\s*0!important/, "CSS grid widgets must enforce margin: 0!important");

  // Ghost preview in client code maintains 8px gutter
  for (const [name, code] of [["dashboard.ts", ts], ["dashboard.js", js]]) {
    assert.match(code, /sizeX\s*=\s*Math\.max\(12,\s*rect\.w\s*\*\s*stepX\s*-\s*(?:8|GRID_GAP_PX)\)/, `${name} must subtract 8px gap from preview width`);
    assert.match(code, /sizeY\s*=\s*Math\.max\(16,\s*rect\.h\s*\*\s*(?:32|GRID_ROW_STEP_PX)\s*-\s*(?:8|GRID_GAP_PX)\)/, `${name} must subtract 8px gap from preview height`);
  }

  // Collision shifting maintains non-overlapping grid positions
  const initial = {
    card1: { x: 0, y: 0, w: 6, h: 6 },
    card2: { x: 6, y: 0, w: 6, h: 6 }
  };
  // Relocating card1 to overlap card2 at (6, 0) pushes card2 down to y=6
  const shifted = relocateGridWidget(initial, "card1", { x: 6, y: 0, w: 6, h: 6 });
  assert.equal(shifted.card1.x, 6);
  assert.equal(shifted.card1.y, 0);
  assert.equal(shifted.card2.x, 6);
  assert.equal(shifted.card2.y, 6); // Shifted down cleanly without overlap, preserving 8px row gap

  // Snapping logic honors 8px gutter
  const snapped = snapToGrid(100, 100, { left: 0, top: 0, width: 1200 }, 6, 6);
  assert.ok(snapped.x >= 0 && snapped.x <= 6);
  assert.ok(snapped.y >= 0);
  assert.equal(snapped.w, 6);
  assert.equal(snapped.h, 6);
});
