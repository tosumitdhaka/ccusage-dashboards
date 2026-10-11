import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_WIDTHS,validateLayout,moveWidgetOrder} from "./public/dashboard-layout.mjs";
import {DEFAULT_DASHBOARD,validateDashboardConfig} from "./public/widget-registry.mjs";
import {parseDashboardJSON,stringifyDashboardConfig} from "./public/dashboard-config.mjs";
test("strict validated grid size choices",()=>{
 assert.deepEqual(validateLayout(undefined).widths,{...DEFAULT_WIDTHS});
 assert.equal(validateLayout({widths:{cache:"full"}}).widths.cache,"full");
 assert.throws(()=>validateLayout({widths:{cache:"auto"}}),/width/);
 assert.throws(()=>validateLayout({widths:{constructor:"full"}}),/widget/);
 assert.throws(()=>validateLayout({css:"expression()"}),/setting/);
 assert.throws(()=>validateLayout({widths:{kpis:"half"}}),/full width/);
});
test("position and size round-trip with existing JSON storage",()=>{
 const cfg=validateDashboardConfig({...DEFAULT_DASHBOARD,widgets:["trend","models","providers"],
 layout:{widths:{models:"full",cache:"full"}}});
 assert.deepEqual(parseDashboardJSON(stringifyDashboardConfig(cfg)),cfg);
 assert.deepEqual(moveWidgetOrder(cfg.widgets,"providers","trend"),["providers","trend","models"]);
 assert.throws(()=>moveWidgetOrder(["trend","trend"],"trend","trend"),/Invalid/);
});
test("v0.2 configs without layout migrate safely",()=>{
 const legacy={...DEFAULT_DASHBOARD};delete legacy.layout;
 assert.deepEqual(validateDashboardConfig(legacy).layout.widths,{...DEFAULT_WIDTHS});
});

test("strict snap grid validates coordinates and prevents overlapping imported layouts",()=>{
 const half=validateLayout({positions:{providers:{x:0,y:0,w:6,h:12},models:{x:6,y:0,w:6,h:12}}});
 assert.equal(half.positions.providers.x,0);
 assert.equal(half.positions.models.x,6);
 assert.throws(()=>validateLayout({positions:{providers:{x:7,y:0,w:6,h:12}}}),/rectangle/);
 assert.throws(()=>validateLayout({positions:{providers:{x:0,y:0,w:6,h:10},models:{x:4,y:5,w:6,h:10}}}),/Overlapping/);
 assert.throws(()=>validateLayout({positions:{providers:{x:0,y:0,w:6,h:1}}}),/rectangle/);
});
test("relocating one widget pushes collisions down without overlap",async()=>{
 const {relocateGridWidget,overlaps,snapToGrid}=await import("./public/dashboard-layout.mjs");
 const start={trend:{x:0,y:0,w:12,h:12},providers:{x:0,y:12,w:6,h:9},models:{x:6,y:12,w:6,h:9}};
 const moved=relocateGridWidget(start,"models",{x:0,y:12,w:8,h:13});
 assert.deepEqual(moved.models,{x:0,y:12,w:8,h:13});
 assert.ok(!overlaps(moved.providers,moved.models));
 assert.ok(!overlaps(moved.trend,moved.models));
 assert.deepEqual(snapToGrid(100,64,{left:0,top:0,width:1200},6,12),{x:1,y:2,w:6,h:12});
});
