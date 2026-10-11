import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_DASHBOARD,validateDashboardConfig,validateCustomCharts} from "./public/widget-registry.mjs";
import {stringifyDashboardConfig,parseDashboardJSON} from "./public/dashboard-config.mjs";
const graph={id:"custom-1",title:"Output by provider",visual:"bars",metric:"outputTokens",breakdown:"provider",period:"weekly"};
test("custom graphs are data-only and roundtrip JSON import",()=>{
 const cfg=validateDashboardConfig({...DEFAULT_DASHBOARD,charts:[graph],widgets:[...DEFAULT_DASHBOARD.widgets,graph.id],layout:{widths:{[graph.id]:"full"}}});
 assert.deepEqual(cfg.charts,[{...graph,hiddenDimensions:[]}]);
 assert.equal(cfg.layout.widths[graph.id],"full");
 assert.deepEqual(parseDashboardJSON(stringifyDashboardConfig(cfg)),cfg);
});
test("reject executable fields and unknown graph expressions",()=>{
 assert.deepEqual(validateCustomCharts(undefined),[]);
 assert.throws(()=>validateCustomCharts([{...graph,visual:"eval"}]),/visualization/);
 assert.throws(()=>validateCustomCharts([{...graph,script:"alert(1)"}]),/definition/);
 assert.throws(()=>validateCustomCharts([{...graph,metric:"currencyExpression"}]),/metric/);
 assert.throws(()=>validateCustomCharts([{...graph,period:"hourly"}]),/period/);
 assert.throws(()=>validateCustomCharts([graph,graph]),/duplicate/);
 assert.throws(()=>validateCustomCharts(Array(5).fill(graph)),/four/);
 assert.throws(()=>validateDashboardConfig({...DEFAULT_DASHBOARD,widgets:[...DEFAULT_DASHBOARD.widgets,"custom-1"]}),/widget/);
});

test("per-graph dimensions accept bounded name filters but not executable entries",()=>{
 const base={...graph,hiddenDimensions:["codex","claude-code"]};
 assert.deepEqual(validateCustomCharts([base])[0].hiddenDimensions,base.hiddenDimensions);
 assert.throws(()=>validateCustomCharts([{...base,hiddenDimensions:["a","a"]}]),/dimensions/);
 assert.throws(()=>validateCustomCharts([{...base,hiddenDimensions:["bad"+String.fromCharCode(10)]}]),/dimensions/);
 assert.throws(()=>validateCustomCharts([{...base,hiddenDimensions:Array(41).fill("a")}]),/dimensions/);
 const v=validateDashboardConfig({...DEFAULT_DASHBOARD,widgetSettings:{providers:{hiddenDimensions:["codex"]},sessions:{hiddenDimensions:["claude-code"]}}});
 assert.deepEqual(v.widgetSettings.providers.hiddenDimensions,["codex"]);
 assert.deepEqual(v.widgetSettings.sessions.hiddenDimensions,["claude-code"]);
});

test("cache and summary dimensions are editable via safe saved filters",()=>{
 const cfg=validateDashboardConfig({...DEFAULT_DASHBOARD,widgetSettings:{
   cache:{hiddenDimensions:["Cache reads"]},kpis:{hiddenDimensions:["API-equivalent cost"]}}});
 assert.deepEqual(cfg.widgetSettings.cache.hiddenDimensions,["Cache reads"]);
 assert.deepEqual(cfg.widgetSettings.kpis.hiddenDimensions,["API-equivalent cost"]);
 assert.deepEqual(parseDashboardJSON(stringifyDashboardConfig(cfg)),cfg);
});
