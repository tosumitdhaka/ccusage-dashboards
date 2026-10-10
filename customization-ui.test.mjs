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
