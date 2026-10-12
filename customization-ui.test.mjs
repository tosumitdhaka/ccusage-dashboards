import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WIDGET_REGISTRY } from "./public/widget-registry.mjs";

test("customize controls and every registered widget have a matching dashboard surface", async () => {
  const html = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
  for (const name of Object.keys(WIDGET_REGISTRY)) {
    assert.ok(html.includes('data-widget="' + name + '"'), "Missing widget panel: " + name);
  }
  for (const id of ["customize", "customize-dialog", "customize-form", "config-export",
    "config-import", "config-import-trigger", "config-reset", "widget-options", "dashboard-title", "config-status"]) {
    assert.ok(html.includes('id="' + id + '"'), "Missing customization control: " + id);
  }
  const src = await readFile(new URL("./src/client/dashboard.ts", import.meta.url), "utf8");
  assert.match(src, /readDashboardConfig/);
  assert.match(src, /persistFilters/);
  assert.match(src, /parseDashboardJSON/);
  assert.match(src, /querySelectorAll\("\[data-widget\]"\)/);
});

test("independent graph controls, warnings and sidebar navigation are wired", async () => {
  const html = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
  for (const control of ["trend-show-labels", "trend-series-limit", "provider-metric", "provider-limit", "model-metric", "model-limit"]) {
    assert.ok(html.includes('id="' + control + '"'), "Missing graph control " + control);
  }
  const js = await readFile(new URL("./src/client/dashboard.ts", import.meta.url), "utf8");
  assert.match(js, /colorForDimension/);
  assert.match(js, /aria-label", "Dismiss pricing warning"/);
  assert.match(js, /updateActiveNavigation/);
  assert.match(js, /updateGraphSettings/);
});

test("graph selectors remain inline in headings, revealed on hover/focus", async () => {
  const html = await readFile(new URL("./public/index.html",import.meta.url),"utf8");
  const checks=[["trend",["metric","breakdown","trend-series-limit","trend-show-labels"]],
    ["providers",["provider-metric","provider-limit"]],["models",["model-metric","model-limit"]],
    ["sessions",["session-metric"]]];
  for(const [name,ids] of checks){
    const start=html.indexOf('id="'+name+'"');
    assert.ok(start>=0,"Missing chart "+name);
    const content=html.slice(start,html.indexOf("</section>",start));
    assert.ok(content.includes('class="chart-header-controls"'),"Missing inline chart controls "+name);
    for(const id of ids)assert.ok(content.includes('id="'+id+'"'),name+" missing "+id);
  }
  assert.ok(!html.includes('class="chart-adjust"'));
  assert.ok(!html.includes('⚙ Adjust'));
});
test("widget surface uses one responsive grid without legacy paired wrappers", async()=>{
  const html=await readFile(new URL("./public/index.html",import.meta.url),"utf8");
  const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
  assert.ok(html.includes('id="dashboard-grid"'));
  assert.ok(!html.includes('data-widget-group'));
  assert.ok(html.includes('id="layout-edit"'));
  assert.ok(css.includes('.dashboard-grid .token-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.ok(css.includes('max-width:482px'));
});

test("v0.3 editor and graph builder are wired to validated configuration",async()=>{
 const html=await readFile(new URL("./public/index.html",import.meta.url),"utf8");
 const js=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
 for(const id of ["add-graph","graph-dialog","graph-form","graph-title","graph-visual","graph-metric",
 "graph-group","graph-period","graph-status","layout-edit"]){
  assert.ok(html.includes('id="'+id+'"'),"Missing control "+id);
 }
 assert.ok(js.includes("setupCustomGraphBuilder()"));
 assert.ok(js.includes("installLayoutEditor()"));
 assert.ok(js.includes("syncCustomChartNodes()"));
 assert.ok(js.includes("renderCustomCharts()"));
 assert.ok(js.includes('surface.setPointerCapture(event.pointerId)'));
 assert.ok(js.includes('closeLayoutEdit(true)'));
 assert.ok(js.includes('closeLayoutEdit(false)'));
});

test("unlocked view, free grid placement and options editor expose explicit controls",async()=>{
 const html=await readFile(new URL("./public/index.html",import.meta.url),"utf8");
 const js=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
 const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
 for(const id of ["visual-editor","visual-editor-form","visual-editor-dimensions","visual-dimension-options"]) 
   assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.includes("Layout Locked"));
 assert.ok(!html.includes(">↕ Arrange<"));
 assert.ok(js.includes('header.draggable=false'));
 assert.ok(js.includes("start.x+Math.round(dx/stepX)"));
 assert.ok(js.includes('edge.setPointerCapture(event.pointerId)'));
 assert.ok(js.includes('resizeGridRectangle('));
 assert.ok(!js.includes('layout-handle\",\"⠿'));
 assert.ok(!js.includes('layout-resize\",\"↘'));
 assert.ok(js.includes('function installVisualizationMenu('));
 assert.ok(js.includes('function refreshDimensionChoices('));
 assert.ok(!js.includes('grid.append(panel)'));
 assert.ok(css.includes("grid-template-columns:repeat(12,minmax(0,1fr))"));
 assert.ok(css.includes("@container(min-width:680px)"));
});

test("visualization menu uses native top-layer popovers outside scroll-clipped grid items",async()=>{
 const src=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
 const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
 assert.ok(src.includes('menu.popover="auto"'));
 assert.ok(src.includes('menu.showPopover()'));
 assert.ok(src.includes('menu.hidePopover()'));
 assert.ok(css.includes('.viz-popover-menu{position:fixed!important'));
});
