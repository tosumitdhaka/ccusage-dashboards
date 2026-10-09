import test from "node:test";
import assert from "node:assert/strict";
import { buildView } from "./public/normalize.mjs";

const report = {
  daily: [
    {
      period: "2026-10-07", agent: "all",
      inputTokens: 100, outputTokens: 40, cacheReadTokens: 10, totalTokens: 140, totalCost: 0.9,
      agents: [
        { agent: "claude", inputTokens: 60, outputTokens: 20, cacheReadTokens: 8, totalTokens: 80, totalCost: 0.6,
          modelBreakdowns: [{ modelName: "opus", inputTokens: 60, outputTokens: 20, cacheReadTokens: 8, cost: 0.6 }] },
        { agent: "codex", inputTokens: 40, outputTokens: 20, cacheReadTokens: 2, totalTokens: 60, totalCost: 0.3,
          modelBreakdowns: [{ modelName: "sol", inputTokens: 40, outputTokens: 20, cacheReadTokens: 2, cost: 0.3, missingPricing: true }] }
      ],
      modelBreakdowns: [
        { modelName: "opus", inputTokens: 60, outputTokens: 20, cacheReadTokens: 8, cost: 0.6 },
        { modelName: "sol", inputTokens: 40, outputTokens: 20, cacheReadTokens: 2, cost: 0.3, missingPricing: true }
      ]
    }
  ],
  weekly: [{ period: "2026-W41", agent: "all", totalTokens: 140, totalCost: 0.9,
    agents: [{ agent: "claude", totalTokens: 80, totalCost: 0.6 }, { agent: "codex", totalTokens: 60, totalCost: 0.3 }] }],
  monthly: [],
  session: [{ agent: "codex", period: "session-1", totalTokens: 60, totalCost: 0.3, metadata: { lastActivity: "2026-10-07T13:00:00Z" } }],
  totals: { unpricedModels: ["sol"] }
};

test("unified totals are not double counted against agent breakdowns", () => {
  const view = buildView(report);
  assert.equal(view.totals.totalTokens, 140);
  assert.equal(view.providerTotals.reduce((s, p) => s + p.totalTokens, 0), 140);
  assert.equal(view.models[0].modelName, "opus");
  assert.equal(view.models[0].outputTokens, 20);
  assert.deepEqual(view.missingPricing, ["sol"]);
});

test("agent selection uses nested authoritative agent rows", () => {
  const view = buildView(report, { agent: "codex" });
  assert.equal(view.totals.totalTokens, 60);
  assert.equal(view.totals.totalCost, 0.3);
  assert.equal(view.models[0].modelName, "sol");
  assert.equal(view.sessions[0].agent, "codex");
  assert.deepEqual(view.providerTotals.map((p) => p.name), ["codex"]);
});

test("weekly report is not added to daily data", () => {
  const view = buildView(report, { section: "weekly" });
  assert.equal(view.totals.totalTokens, 140);
  assert.equal(view.trend[0].period, "2026-W41");
});

test("unknown providers and empty reports yield honest zeros", () => {
  const view = buildView(report, { agent: "antigravity" });
  assert.equal(view.totals.totalTokens, 0);
  assert.equal(view.trend.length, 0);
  assert.deepEqual(view.providerTotals, []);
});

test("malformed report and unsupported period fail closed", () => {
  assert.throws(() => buildView({ daily: null }), /daily array/);
  assert.throws(() => buildView(report, { section: "hourly" }), /Unsupported/);
});

test("missing cost stays distinguishable from zero-cost reports", () => {
  const view = buildView({ daily: [{ period: "2026-10-07", totalTokens: 10 }] });
  assert.equal(view.hasCost, false);
  assert.equal(view.totals.totalCost, 0);
});
