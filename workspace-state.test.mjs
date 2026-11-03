import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceStore } from "./public/workspace-state.mjs";

test("workspace store centralizes filters and de-duplicates entity values", () => {
  const store = createWorkspaceStore();
  const sources = [];
  store.subscribe((_next, _previous, meta) => sources.push(meta.source));

  assert.equal(store.setFilters({ providers: ["claude", "claude"], models: ["sonnet"] }, "test-filter"), true);
  assert.deepEqual(store.getState().filters.providers, ["claude"]);
  assert.deepEqual(store.getState().filters.models, ["sonnet"]);
  assert.deepEqual(sources, ["test-filter"]);

  assert.equal(store.setFilters({ providers: ["claude"], models: ["sonnet"] }, "duplicate"), false);
  assert.deepEqual(sources, ["test-filter"]);
});

test("workspace store clear keeps period, metric and density", () => {
  const store = createWorkspaceStore({
    filters: { period: "30d", providers: ["codex"], models: ["gpt"], metric: "totalCost" },
    density: "compact"
  });
  store.clearEntityFilters("clear");
  const state = store.getState();
  assert.equal(state.filters.period, "30d");
  assert.equal(state.filters.metric, "totalCost");
  assert.equal(state.density, "compact");
  assert.deepEqual(state.filters.providers, []);
  assert.deepEqual(state.filters.models, []);
});
