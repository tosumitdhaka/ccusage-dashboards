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
