import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {GRAPH_PRESETS,getGraphPreset} from "./public/widget-presets.mjs";
import {validateCustomCharts} from "./public/widget-registry.mjs";
test("curated graph presets validate as data-only custom charts",()=>{
  for(const preset of GRAPH_PRESETS){
    const config={...getGraphPreset(preset.id),id:"custom-1",hiddenDimensions:[]};
    delete config.id; // preset IDs are not saved graph IDs
    const out=validateCustomCharts([{...config,id:"custom-1"}]);
    assert.equal(out[0].title,preset.title);
  }
  assert.throws(()=>getGraphPreset("unknown"),/Unknown graph preset/);
});
test("widget builder template selection uses the validated local-only preset module",async()=>{
  const html=await readFile(new URL("./public/index.html",import.meta.url),"utf8");
  const source=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  assert.match(html,/id="graph-preset"/);
  assert.match(source,/getGraphPreset\(id\)/);
  assert.match(source,/graph-preset.*addEventListener/);
});
