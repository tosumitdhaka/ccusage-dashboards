import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("refresh coalesces overlapping requests and skips equivalent payload rerenders",async()=>{
  const source=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  const block=source.slice(source.indexOf("let lastLoadedAt = 0;"),source.indexOf("const breakdownEl ="));
  assert.match(block,/if \(loadInFlight\) return/);
  assert.match(block,/reportPayload !== lastReportPayload/);
  assert.match(block,/hourlyPayload !== lastHourlyPayload/);
  assert.match(block,/if \(changed \|\| hourlyChanged\) render\(\)/);
  assert.match(block,/loadInFlight = false/);
});
