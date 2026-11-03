import test from "node:test";
import assert from "node:assert/strict";
import { formatMetric, formatDuration, formatPercentage } from "./public/formatting.mjs";

test("formatting helpers keep metric presentation deterministic", () => {
  assert.equal(formatMetric(1250, "totalTokens"), "1.25K");
  assert.match(formatMetric(12.5, "totalCost"), /^\$12\.50$/);
  assert.equal(formatDuration(90_000), "2m");
  assert.equal(formatPercentage(.125), "12.5%");
});
