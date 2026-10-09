import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const BASE = new URL("./public/", import.meta.url);
const [html, css, app] = await Promise.all([
  readFile(new URL("index.html", BASE), "utf8"),
  readFile(new URL("styles.css", BASE), "utf8"),
  readFile(new URL("dashboard.js", BASE), "utf8")
]);

test("trend chart selectors share the heading instead of pushing plot down", () => {
  const trend = html.slice(html.indexOf('<section class="wide-card trend-card"'));
  const headingStart = trend.indexOf('class="section-header trend-header"');
  const headingActions = trend.indexOf('class="trend-header-actions"');
  const metric = trend.indexOf('id="metric"');
  const breakdown = trend.indexOf('id="breakdown"');
  const chart = trend.indexOf('class="chart-container"');
  const footer = trend.indexOf('class="trend-legend-footer"');
  const legend = trend.indexOf('id="trend-legend"');
  assert.ok(headingStart >= 0 && headingActions > headingStart);
  assert.ok(metric > headingActions && breakdown > metric);
  assert.ok(chart > breakdown);
  assert.ok(footer > chart && legend > footer);
  assert.equal((trend.match(/id="metric"/g) ?? []).length, 1);
  assert.equal((trend.match(/id="breakdown"/g) ?? []).length, 1);
  assert.equal((trend.match(/id="trend-legend"/g) ?? []).length, 1);
});

test("plot consumes real responsive viewport, not fixed aspect-ratio letterbox", () => {
  assert.match(css, /\.trend-card \.chart-container svg\s*\{/);
  assert.match(css, /height:clamp\(315px,30vw,425px\)/);
  assert.match(app, /svg\.getBoundingClientRect\(\)\.width/);
  assert.match(app, /svg\.getBoundingClientRect\(\)\.height/);
  assert.match(app, /svg\.setAttribute\("viewBox"/);
  assert.match(app, /window\.addEventListener\("resize"/);
});

test("controls and legend adapt at tablet and mobile widths", () => {
  assert.match(css, /@media\(max-width:1250px\)/);
  assert.match(css, /@media\(max-width:740px\)/);
  assert.match(css, /\.trend-header-actions \.trend-controls label/);
  assert.match(css, /\.trend-legend-footer/);
});
