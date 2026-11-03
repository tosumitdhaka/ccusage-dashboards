import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("live builder preview uses local analytics and responds to form changes",async()=>{
  const html=await readFile(new URL("./public/index.html",import.meta.url),"utf8");
  const ts=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  assert.match(html,/id="graph-preview-plot"/);
  assert.match(ts,/function updateGraphBuilderPreview\(\)/);
  assert.match(ts,/const chart=buildChart\(report/);
  assert.match(ts,/addEventListener\("change",updateGraphBuilderPreview\)/);
  assert.match(ts,/plot.replaceChildren\(\)/);
});
