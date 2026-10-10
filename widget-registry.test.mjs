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

test("schema v1 rejects unknown or malformed preferences before importing", () => {
  const base = structuredClone(DEFAULT_DASHBOARD);
  assert.throws(() => validateDashboardConfig({ ...base, widgets: ["constructor"] }), /widget/);
  assert.throws(() => validateDashboardConfig({ ...base, widgets: [] }), /widgets/);
  assert.throws(() => validateDashboardConfig({ ...base, filters: { metric: "totalCost", newFlag: true } }), /filter/);
  assert.throws(() => validateDashboardConfig({ ...base, filters: { period: "tomorrow" } }), /period/);
  assert.throws(() => validateDashboardConfig({ ...base, filters: { provider: "" } }), /provider/);
  assert.throws(() => validateDashboardConfig({ ...base, title: "x".repeat(81) }), /title/);
  assert.throws(() => validateDashboardConfig({ ...base, exportSessionId: "sensitive" }), /field/);
});

test("per-graph settings validate and older saved configurations migrate to defaults", () => {
  const old = structuredClone(DEFAULT_DASHBOARD);
  delete old.widgetSettings;
  const migrated = validateDashboardConfig(old);
  assert.equal(migrated.widgetSettings.providers.metric, "totalTokens");
  assert.equal(migrated.widgetSettings.trend.maxSeries, 6);
  const custom = validateDashboardConfig({
    ...old,
    widgetSettings: {
      trend: { showLabels: true, maxSeries: 12 },
      providers: { metric: "totalCost", limit: 5 },
      models: { metric: "outputTokens", limit: 10 }
    }
  });
  assert.equal(custom.widgetSettings.trend.showLabels, true);
  assert.equal(custom.widgetSettings.providers.metric, "totalCost");
  assert.equal(custom.widgetSettings.models.limit, 10);
  assert.throws(() => validateDashboardConfig({ ...old, widgetSettings: { untrusted: {} } }), /group/);
  assert.throws(() => validateDashboardConfig({ ...old, widgetSettings: { trend: { customJS: "evil" } } }), /setting/);
  assert.throws(() => validateDashboardConfig({ ...old, widgetSettings: { models: { metric: "invalid" } } }), /metric/);
  assert.throws(() => validateDashboardConfig({ ...old, widgetSettings: { trend: { showLabels: "true" } } }), /labels/);
  assert.throws(() => validateDashboardConfig({ ...old, widgetSettings: { providers: { limit: 200 } } }), /limit/);
});
