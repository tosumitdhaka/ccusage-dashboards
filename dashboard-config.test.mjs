import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DASHBOARD, validateDashboardConfig } from "./public/widget-registry.mjs";
import {
  DASHBOARD_STORAGE_KEY, LEGACY_DASHBOARD_STORAGE_KEY, PERSISTED_DASHBOARD_VERSION, parsePersistedDashboardV4, stringifyPersistedDashboardV4, parseDashboardJSON, readDashboardConfig,
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
  assert.deepEqual(readDashboardConfig(local), validateDashboardConfig(DEFAULT_DASHBOARD));
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

test("v4 persisted envelope round-trips and migrates legacy preferences without eager writes", () => {
  const legacy=storage();
  const initial={...DEFAULT_DASHBOARD,title:"Legacy dashboard"};
  legacy.setItem(LEGACY_DASHBOARD_STORAGE_KEY,stringifyDashboardConfig(initial));
  assert.equal(readDashboardConfig(legacy).title,"Legacy dashboard");
  assert.equal(legacy.getItem(DASHBOARD_STORAGE_KEY),null);
  const saved=saveDashboardConfig(legacy,readDashboardConfig(legacy));
  assert.equal(saved.title,"Legacy dashboard");
  const envelope=JSON.parse(legacy.peek());
  assert.equal(envelope.schemaVersion,PERSISTED_DASHBOARD_VERSION);
  assert.equal(envelope.dashboard.title,"Legacy dashboard");
  assert.deepEqual(parsePersistedDashboardV4(stringifyPersistedDashboardV4(initial)),saved);
  resetDashboardConfig(legacy);
  assert.equal(legacy.getItem(DASHBOARD_STORAGE_KEY),null);
  assert.equal(legacy.getItem(LEGACY_DASHBOARD_STORAGE_KEY),null);
});
test("v4 invalid or oversized envelopes fail closed before mutating storage",()=>{
  const local=storage();
  const before=saveDashboardConfig(local,DEFAULT_DASHBOARD);
  const snapshot=local.peek();
  assert.throws(()=>parsePersistedDashboardV4(JSON.stringify({schemaVersion:3,dashboard:before})),/version/);
  assert.throws(()=>parsePersistedDashboardV4(JSON.stringify({schemaVersion:4,dashboard:before,extra:true})),/fields/);
  assert.throws(()=>parsePersistedDashboardV4("x".repeat(16385)),/16 KiB/);
  assert.throws(()=>saveDashboardConfig(local,{...before,widgets:[]}),/widgets/);
  assert.equal(local.peek(),snapshot);
});
