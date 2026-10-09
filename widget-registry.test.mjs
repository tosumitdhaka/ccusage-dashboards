import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DASHBOARD, METRIC_NAMES, WIDGET_REGISTRY, validateDashboardConfig } from "./public/widget-registry.mjs";

test("declarative default dashboard references registered widgets", () => {
  const config=validateDashboardConfig(DEFAULT_DASHBOARD);
  assert.equal(config.schemaVersion,1);
  assert.ok(config.widgets.includes("trend"));
  for(const widget of config.widgets)assert.ok(WIDGET_REGISTRY[widget]);
  assert.ok(Object.hasOwn(METRIC_NAMES,"totalCost"));
});

test("new dashboard definitions validate future customization boundaries", () => {
  const custom=validateDashboardConfig({schemaVersion:1,id:"my-costs",title:"Cost analysis",widgets:["trend","sessions"],filters:{metric:"totalCost"}});
  assert.equal(custom.filters.metric,"totalCost");
  assert.throws(()=>validateDashboardConfig({schemaVersion:2,id:"future",widgets:["trend"]}),/schema/);
  assert.throws(()=>validateDashboardConfig({schemaVersion:1,id:"bad",widgets:["script"]}),/widget/);
  assert.throws(()=>validateDashboardConfig({schemaVersion:1,id:"duplicate",widgets:["trend","trend"]}),/Duplicate/);
});
