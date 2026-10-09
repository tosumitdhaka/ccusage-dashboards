import test from "node:test";
import assert from "node:assert/strict";
import { buildChart, buildObservedHourly, buildSessions, chartCatalog } from "./public/analytics.mjs";

const breakdown = (modelName, inputTokens, outputTokens, cost, missingPricing = false) => ({
  modelName, inputTokens, outputTokens, cacheCreationTokens: 0, cacheReadTokens: 20, cost, missingPricing
});
const sample = {
  daily: [
    {
      period: "2026-10-07", agent: "all", totalTokens: 300, totalCost: 2.5,
      agents: [
        { agent: "codex", totalTokens: 200, totalCost: 2,
          modelBreakdowns: [breakdown("sol", 20, 40, 2)] },
        { agent: "claude", totalTokens: 100, totalCost: 0.5,
          modelBreakdowns: [breakdown("opus", 10, 25, 0.5)] }
      ],
      modelBreakdowns: [breakdown("sol", 20, 40, 2), breakdown("opus", 10, 25, 0.5)]
    },
    {
      period: "2026-10-08", agent: "all", totalTokens: 400, totalCost: 3.5,
      agents: [
        { agent: "codex", totalTokens: 250, totalCost: 2.5, modelBreakdowns: [breakdown("sol", 30, 50, 2.5)] },
        { agent: "claude", totalTokens: 150, totalCost: 1, modelBreakdowns: [breakdown("opus", 20, 30, 1)] }
      ],
      modelBreakdowns: [breakdown("sol", 30, 50, 2.5), breakdown("opus", 20, 30, 1)]
    }
  ],
  weekly: [{ period: "2026-W41", totalTokens: 700, totalCost: 6, agents: [
    { agent: "codex", totalTokens: 450, totalCost: 4.5, modelBreakdowns: [breakdown("sol", 50, 90, 4.5)] },
    { agent: "claude", totalTokens: 250, totalCost: 1.5, modelBreakdowns: [breakdown("opus", 30, 55, 1.5)] }
  ] }],
  session: [
    { period: "c1", agent: "codex", totalTokens: 90, totalCost: .7, metadata: { lastActivity: "2026-10-08T17:00:00Z" }, modelBreakdowns: [breakdown("sol", 10, 20, .7)] },
    { period: "c2", agent: "claude", totalTokens: 200, totalCost: 1.3, metadata: { lastActivity: "2026-10-08T18:00:00Z" }, modelBreakdowns: [breakdown("opus", 40, 80, 1.3)] },
    { period: "c3", agent: "codex", totalTokens: 130, totalCost: .9, modelBreakdowns: [breakdown("sol", 20, 30, .9)] }
  ]
};
test("catalog lists both providers and models", () => {
  assert.deepEqual(chartCatalog(sample), { agents: ["claude", "codex"], models: ["opus", "sol"] });
});
test("total trend reads authoritative upstream totals only", () => {
  const view = buildChart(sample);
  assert.equal(view.total, 700);
  assert.deepEqual(view.points.map((p) => p.values.Total), [300, 400]);
});
test("provider series never double counts the parent all row", () => {
  const view = buildChart(sample, { breakdown: "provider" });
  assert.deepEqual(view.series.map((s) => [s.name, s.value]), [["codex", 450], ["claude", 250]]);
  assert.equal(view.total, 700);
});
test("one provider filtered without affecting others", () => {
  const view = buildChart(sample, { agent: "codex" });
  assert.deepEqual(view.points.map((p) => p.values.Total), [200, 250]);
  assert.equal(view.total, 450);
});
test("model selection uses model breakdown, not the entire parent provider", () => {
  const view = buildChart(sample, { model: "sol" });
  assert.equal(view.total, 20 + 40 + 20 + 30 + 50 + 20);
  assert.equal(view.isModelCategorySum, true);
  assert.deepEqual(view.points.map((p) => p.values.Total), [80, 100]);
});
test("per model cost and output trends work independently", () => {
  const cost = buildChart(sample, { period: "weekly", metric: "totalCost", breakdown: "model" });
  assert.deepEqual(cost.series.map((p) => [p.name, p.value]), [["sol", 4.5], ["opus", 1.5]]);
  const out = buildChart(sample, { breakdown: "model", metric: "outputTokens" });
  assert.deepEqual(out.series.map((p) => [p.name, p.value]), [["sol", 90], ["opus", 55]]);
});
test("session graphs rank entire sessions and model-only portions correctly", () => {
  const total = buildSessions(sample);
  assert.deepEqual(total.map((s) => s.session), ["c2", "c3", "c1"]);
  const codex = buildSessions(sample, { agent: "codex", metric: "totalCost" });
  assert.deepEqual(codex.map((s) => s.session), ["c3", "c1"]);
  const model = buildSessions(sample, { model: "opus", metric: "outputTokens" });
  assert.equal(model.length, 1);
  assert.equal(model[0].value, 80);
});
test("observed hourly deltas need a baseline and are never inferred from session time", () => {
  const row = sample.daily[0];
  const second = structuredClone(row);
  second.totalTokens = 340;
  second.totalCost = 3.5;
  second.agents[0].totalTokens = 240;
  second.agents[0].totalCost = 3;
  const snapshots = [
    { timestamp: "2026-10-07T09:00:00.000Z", day: "2026-10-07", row },
    { timestamp: "2026-10-07T10:00:00.000Z", day: "2026-10-07", row: second }
  ];
  assert.equal(buildObservedHourly(snapshots).total, 40);
  assert.equal(buildObservedHourly(snapshots, { metric: "totalCost", breakdown: "provider" }).total, 1);
  assert.equal(buildObservedHourly(snapshots.slice(0, 1)).total, 0);
});
test("hourly observation never attributes across a date boundary", () => {
  const snapshots = [
    { timestamp: "2026-10-07T23:00:00.000Z", day: "2026-10-07", row: sample.daily[0] },
    { timestamp: "2026-10-08T01:00:00.000Z", day: "2026-10-08", row: sample.daily[1] }
  ];
  assert.equal(buildObservedHourly(snapshots).total, 0);
});
