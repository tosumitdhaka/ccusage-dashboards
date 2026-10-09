import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { observation, createSnapshotStore } from "./snapshots.mjs";

const report = (tokens) => ({
  daily: [{
    period: "2026-10-09", agent: "all", totalTokens: tokens, totalCost: tokens / 100,
    agents: [{
      agent: "codex", totalTokens: tokens, totalCost: tokens / 100,
      modelBreakdowns: [{ modelName: "gpt-example", inputTokens: tokens / 2, outputTokens: tokens / 2, cacheReadTokens: 0, cacheCreationTokens: 0, cost: tokens / 100 }]
    }]
  }],
  session: [{ period: "private-session-id", agent: "codex", totalTokens: tokens }]
});
test("observation stores only compact daily data, never session identifiers", () => {
  const o = observation(report(50), "2026-10-09T10:10:00.000Z");
  assert.equal(o.row.agents[0].agent, "codex");
  assert.equal(o.row.totalTokens, 50);
  assert.equal(JSON.stringify(o).includes("private-session-id"), false);
  assert.equal(observation({ daily: [] }), null);
});
test("persisted snapshots survive a new store and do not duplicate identical values", async () => {
  const dir = await mkdtemp(join(tmpdir(), "usage-observations-"));
  const filename = join(dir, "nested", "history.json");
  try {
    const first = createSnapshotStore({ file: filename, max: 2 });
    await first.append(report(50));
    await first.append(report(50));
    assert.equal((await first.read()).length, 1);
    await first.append(report(70));
    await first.append(report(90));
    const second = createSnapshotStore({ file: filename, max: 2 });
    const items = await second.read();
    assert.equal(items.length, 2);
    assert.deepEqual(items.map((x) => x.row.totalTokens), [70, 90]);
    assert.equal((await readFile(filename, "utf8")).includes("private-session-id"), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
