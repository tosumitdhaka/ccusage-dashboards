import test from "node:test";
import assert from "node:assert/strict";
import { colorForDimension, labelPointIndices } from "./public/chart-presentation.mjs";

test("provider colors are stable across cost/token views, ranks and charts", () => {
  const codex = colorForDimension("codex", "provider");
  assert.equal(codex, "#53d6be");
  assert.equal(codex, colorForDimension("CODEX", "provider"));
  assert.equal(colorForDimension("claude-code", "provider"), "#7ea7ff");
  assert.equal(colorForDimension("antigravity", "provider"), "#f3bd72");
  const model = colorForDimension("gpt-6", "model");
  assert.equal(model, colorForDimension("gpt-6", "model"));
  assert.notEqual(model, colorForDimension("claude-sonnet", "model"));
});
test("labels fit without dropping last point", () => {
  assert.deepEqual(labelPointIndices(0), []);
  assert.deepEqual(labelPointIndices(3), [0, 1, 2]);
  const lots = labelPointIndices(90, 12);
  assert.ok(lots.length <= 13);
  assert.equal(lots[0], 0);
  assert.equal(lots.at(-1), 89);
});
