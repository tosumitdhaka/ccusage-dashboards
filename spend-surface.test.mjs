import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {DEFAULT_DASHBOARD} from "./public/widget-registry.mjs";

test("spend-first surface makes cost the default analytical question",async()=>{
  assert.equal(DEFAULT_DASHBOARD.filters.metric,"totalCost");
  assert.equal(DEFAULT_DASHBOARD.filters.sessionMetric,"totalCost");
  assert.equal(DEFAULT_DASHBOARD.widgetSettings.providers.metric,"totalCost");
  assert.equal(DEFAULT_DASHBOARD.widgetSettings.models.metric,"totalCost");
  assert.equal(DEFAULT_DASHBOARD.widgetSettings.providers.limit,5);
  assert.equal(DEFAULT_DASHBOARD.widgetSettings.models.limit,5);
  const html=await readFile(new URL("./public/index.html",import.meta.url),"utf8");
  for(const id of ["stat-cost","stat-daily-average","stat-cost-per-million","stat-top-provider","stat-top-model","agent","model","header-period"]){
    assert.ok(html.includes('id="'+id+'"'),"missing spend control "+id);
  }
  assert.ok(html.includes("AI spend overview"));
  assert.ok(html.includes("Highest-cost sessions"));
});

test("clean spend surface uses document flow instead of nested widget scrolling",async()=>{
  const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
  const ts=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  assert.ok(css.includes("body.spend-surface .sidebar{display:none}"));
  assert.ok(css.includes("grid-auto-rows:auto!important"));
  assert.match(css,/body\.spend-surface \.dashboard-grid>\[data-widget\]>\.widget-scroll-body\{[\s\S]*?overflow:visible!important/);
  assert.ok(css.includes("body.spend-surface .experimental-layout{display:none!important}"));
  assert.ok(!ts.includes('grid.addEventListener("wheel"'));
});

test("spend summary derives day average, blended rate and spend leaders from priced data",async()=>{
  const ts=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  assert.ok(ts.includes('providerCostGraph=buildChart'));
  assert.ok(ts.includes('modelCostGraph=buildChart'));
  assert.ok(ts.includes('cost/activeDays'));
  assert.ok(ts.includes('cost/vals.totalTokens*1_000_000'));
  assert.ok(ts.includes('percent(topProvider.value/cost)'));
  assert.ok(ts.includes('SPEND_SURFACE_MIGRATION_KEY'));
});

test("primary spend cards suppress dense inline configuration while retaining options menus",async()=>{
  const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
  assert.ok(css.includes('body.spend-surface [data-widget="providers"] .chart-header-controls'));
  assert.ok(css.includes('body.spend-surface [data-widget="models"] .chart-header-controls'));
  assert.ok(css.includes('body.spend-surface [data-widget="sessions"] .chart-header-controls'));
  assert.ok(css.includes('body.spend-surface [data-widget="trend"] .trend-controls label:not(:first-child)'));
});

test("session spend surface ranks by cost but preserves token detail",async()=>{
  const ts=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  assert.ok(ts.includes('metric:"totalCost",limit:30'));
  assert.ok(ts.includes("drawSessionGraph(sessionCosts.slice(0,5))"));
  assert.ok(ts.includes("tokenBySession"));
  assert.ok(ts.includes("fmt(row.tokens ?? row.value)"));
});
