import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DASHBOARD } from "./public/widget-registry.mjs";
import {
  DASHBOARD_STORAGE_KEY, parseDashboardJSON, readDashboardConfig,
  saveDashboardConfig, resetDashboardConfig, stringifyDashboardConfig
} from "./public/dashboard-config.mjs";

function storage() {
  const db = new Map();
  return {
    getItem: (key) => db.has(key) ? db.get(key) : null,
    setItem: (key, value) => db.set(key, value),
    removeItem: (key) => db.delete(key),
    peek: () => db.get(DASHBOARD_STORAGE_KEY)
  };
}
test("widget visibility and filters persist without agent usage data", () => {
  const local = storage();
  const config = {
    ...DEFAULT_DASHBOARD, title: "Cost review", widgets: ["kpis", "trend", "sessions"],
    filters: { period: "hourly", provider: "codex", model: "gpt-6", metric: "totalCost", breakdown: "model", sessionMetric: "totalCost" }
  };
  const saved = saveDashboardConfig(local, config);
  assert.deepEqual(readDashboardConfig(local), saved);
  assert.equal(saved.title, "Cost review");
  assert.deepEqual(saved.widgets, ["kpis", "trend", "sessions"]);
  assert.equal(saved.filters.period, "hourly");
  assert.ok(!local.peek().includes("sessionId"));
  assert.deepEqual(resetDashboardConfig(local), readDashboardConfig(local));
  assert.deepEqual(readDashboardConfig(local), { ...DEFAULT_DASHBOARD, widgets: [...DEFAULT_DASHBOARD.widgets], filters: { ...DEFAULT_DASHBOARD.filters } });
});
test("JSON import/export validates schema, controls and size", () => {
  const exported = stringifyDashboardConfig(DEFAULT_DASHBOARD);
  assert.deepEqual(parseDashboardJSON(exported), readDashboardConfig(storage()));
  assert.throws(() => parseDashboardJSON("not-json"), /JSON/);
  assert.throws(() => parseDashboardJSON("x".repeat(16_385)), /16 KiB/);
  assert.throws(() => parseDashboardJSON(JSON.stringify({ ...DEFAULT_DASHBOARD, token: "secret" })), /field/);
  assert.throws(() => parseDashboardJSON(JSON.stringify({ ...DEFAULT_DASHBOARD, filters: { metric: "garbage" } })), /metric/);
  assert.throws(() => parseDashboardJSON(JSON.stringify({ ...DEFAULT_DASHBOARD, widgets: ["constructor"] })), /widget/);
  assert.throws(() => parseDashboardJSON(JSON.stringify({ ...DEFAULT_DASHBOARD, widgets: [] })), /widgets/);
});
test("failed storage writes do not produce a partial persisted configuration", () => {
  const local = { getItem() { return null; }, setItem() { throw Error("Storage disabled"); }, removeItem() {} };
  assert.throws(() => saveDashboardConfig(local, DEFAULT_DASHBOARD), /disabled/);
  assert.deepEqual(readDashboardConfig(local).widgets, DEFAULT_DASHBOARD.widgets);
});
