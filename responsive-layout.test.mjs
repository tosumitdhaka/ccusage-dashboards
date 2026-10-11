import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {validateLayout,visibleGridOrder,moveWidgetByVisualOrder,compactVisibleLayout,overlaps} from "./public/dashboard-layout.mjs";

test("arrows track the actual visual position after free dragging",()=>{
  const positions={trend:{x:0,y:0,w:12,h:10},providers:{x:0,y:10,w:6,h:8},models:{x:6,y:10,w:6,h:8}};
  const visible=["models","trend","providers"];
  assert.deepEqual(visibleGridOrder(positions,visible),["trend","providers","models"]);
  const up=moveWidgetByVisualOrder(positions,visible,"models",-1);
  assert.ok(visibleGridOrder(up,visible).indexOf("models")<visibleGridOrder(up,visible).indexOf("providers"));
  assert.equal(overlaps(up.models,up.providers),false);
  const down=moveWidgetByVisualOrder(up,visible,"models",1);
  assert.ok(visibleGridOrder(down,visible).indexOf("providers")<visibleGridOrder(down,visible).indexOf("models"));
  assert.equal(moveWidgetByVisualOrder(positions,visible,"trend",-1),null);
});
test("hiding Data Notes repacks positions and expands cache into four columns",()=>{
  const start=validateLayout(undefined).positions;
  const visible=["kpis","trend","providers","models","cache","sessions"];
  const packed=compactVisibleLayout(start,visible,1200);
  assert.equal(packed.cache.w,12);
  assert.equal(packed.cache.h,6);
  assert.ok(packed.guidance.y>=packed.sessions.y+packed.sessions.h);
  for(const [i,a] of Object.keys(packed).entries())
    for(const b of Object.keys(packed).slice(i+1))
      assert.equal(overlaps(packed[a],packed[b]),false,a+" overlaps "+b);
  assert.deepEqual(Object.keys(packed),Object.keys(start));
  assert.throws(()=>compactVisibleLayout(start,["trend","trend"],1200),/visibility/);
});
test("stacked breakpoint disables unsupported grips and supports arrow-only reordering",async()=>{
  const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
  const js=await readFile(new URL("./public/dashboard.js",import.meta.url),"utf8");
  const html=await readFile(new URL("./public/index.html",import.meta.url),"utf8");
  assert.ok(css.includes("@media (min-width:741px) and (max-width:1100px)"));
  assert.ok(js.includes("header.draggable=false"));
  assert.ok(js.includes('$("layout-edit").disabled=arranging||!gridMode'));
  assert.ok(js.includes("edge.hidden=!arranging||!gridMode||panel.hidden"));
  assert.ok(!js.includes("function swapGridNeighbors("));
  assert.ok(js.includes("panel.style.order=String(ordered.indexOf(id))"));
  assert.ok(html.includes('id="layout-help"'));
  assert.ok(css.includes(".top-actions{width:100%;justify-content:flex-start;flex-wrap:wrap"));
});
test("provider and model panel scrolling is single-region",async()=>{
  const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
  assert.ok(css.includes('.dashboard-grid>[data-widget]:not([data-widget="kpis"]){'));
  assert.ok(css.includes('.widget-scroll-body .bars{max-height:none;overflow:visible}'));
  assert.ok(css.includes("max-height:none;overflow-y:auto;overflow-x:hidden"));
});
