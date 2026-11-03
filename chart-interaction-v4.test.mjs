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

test("tooltip content is reused rather than rebuilt on pointer updates", async () => {
  const {readFile}=await import("node:fs/promises");
  const src=await readFile(new URL("./src/client/chart-interaction.mts",import.meta.url),"utf8");
  const init=src.indexOf("const rows = options.series.map");
  const show=src.indexOf("const show = (");
  assert.ok(init>=0 && init<show,"Expected one-time tooltip row construction");
  assert.match(src,/if \(tooltip.firstChild !== header\) tooltip.replaceChildren\(header, seriesList\)/);
  assert.match(src,/value.textContent = formatted/);
});
