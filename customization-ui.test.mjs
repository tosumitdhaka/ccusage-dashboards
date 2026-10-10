import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WIDGET_REGISTRY } from "./public/widget-registry.mjs";

test("customize controls and every registered widget have a matching dashboard surface", async () => {
  const html = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
  for (const name of Object.keys(WIDGET_REGISTRY)) {
    assert.ok(html.includes('data-widget="' + name + '"'), "Missing widget panel: " + name);
  }
  for (const id of ["customize", "customize-dialog", "customize-form", "config-export",
    "config-import", "config-import-trigger", "config-reset", "widget-options", "dashboard-title", "config-status"]) {
    assert.ok(html.includes('id="' + id + '"'), "Missing customization control: " + id);
  }
  const src = await readFile(new URL("./public/dashboard.js", import.meta.url), "utf8");
  assert.match(src, /readDashboardConfig/);
  assert.match(src, /persistFilters/);
  assert.match(src, /parseDashboardJSON/);
  assert.match(src, /querySelectorAll\("\[data-widget\]"\)/);
});

test("independent graph controls, warnings and sidebar navigation are wired", async () => {
  const html = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
  for (const control of ["trend-show-labels", "trend-series-limit", "provider-metric", "provider-limit", "model-metric", "model-limit"]) {
    assert.ok(html.includes('id="' + control + '"'), "Missing graph control " + control);
  }
  const js = await readFile(new URL("./public/dashboard.js", import.meta.url), "utf8");
  assert.match(js, /colorForDimension/);
  assert.match(js, /aria-label", "Dismiss pricing warning"/);
  assert.match(js, /updateActiveNavigation/);
  assert.match(js, /updateGraphSettings/);
});

test("graph settings live in right-hand headers and stay keyboard accessible", async () => {
  const html = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
  const checks = [
    ["trend", ["metric", "breakdown", "trend-series-limit", "trend-show-labels"]],
    ["providers", ["provider-metric", "provider-limit"]],
    ["models", ["model-metric", "model-limit"]],
    ["sessions", ["session-metric"]]
  ];
  for (const [name, ids] of checks) {
    const start = html.indexOf('id="' + name + '"');
    assert.ok(start >= 0, "Missing graph section " + name);
    const rest = html.slice(start);
    const match = rest.match(/<details class="chart-adjust" name="graph-adjust">([\\s\\S]*?)<\\/details>/);
    assert.ok(match, "Missing right-header adjuster in " + name);
    assert.match(match[1], /<summary class="chart-adjust-trigger" aria-label="Adjust /);
    for (const id of ids) assert.ok(match[1].includes('id="' + id + '"'), name + " missing " + id + " in settings");
  }
  assert.equal((html.match(/<details class="chart-adjust" name="graph-adjust">/g) ?? []).length, 4);
  const css = await readFile(new URL("./public/styles.css", import.meta.url), "utf8");
  assert.match(css, /\\.chart-adjust-panel\\{position:absolute;right:0/);
  assert.match(css, /\\.chart-adjust-trigger:focus-visible/);
});
