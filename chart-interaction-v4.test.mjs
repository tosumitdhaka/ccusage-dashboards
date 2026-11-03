import test from "node:test";
import assert from "node:assert/strict";
import { nearestPointIndex } from "./public/chart-interaction.mjs";

test("nearestPointIndex resolves the synchronized crosshair point deterministically", () => {
  const points = [{x:10},{x:30},{x:60},{x:100}];
  assert.equal(nearestPointIndex(points, 0), 0);
  assert.equal(nearestPointIndex(points, 29), 1);
  assert.equal(nearestPointIndex(points, 52), 2);
  assert.equal(nearestPointIndex(points, 120), 3);
  assert.equal(nearestPointIndex([], 10), -1);
});
