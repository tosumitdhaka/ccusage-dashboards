import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("unlocked grid offers eight edge resize zones without cluttering widget controls",async()=>{
 const js=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
 const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
 const html=await readFile(new URL("./public/index.html",import.meta.url),"utf8");
 assert.ok(html.includes(">🔒 Layout Locked</button>"));
 assert.ok(js.includes('arranging?"🔓 Layout Unlocked":"🔒 Layout Locked"'));
 assert.ok(!js.includes('["⌃",-1],["⌄",1]'));
 assert.ok(html.includes('id="layout-save"'));
 assert.ok(html.includes('id="layout-cancel"'));
 assert.ok(js.includes('["n","s","e","w","ne","nw","se","sw"]'));
 assert.ok(js.includes('edge.addEventListener("pointerdown"'));
 assert.ok(js.includes('edge.setPointerCapture(event.pointerId)'));
 assert.ok(!js.includes('el("span","layout-handle"'));
 assert.ok(!js.includes('el("button","layout-resize"'));
 assert.ok(css.includes(".dashboard-grid .edge-ne"));
 assert.ok(css.includes(".dashboard-grid .edge-sw"));
 assert.ok(css.includes(".dashboard-grid .layout-resize-edge:hover"));
});

test("live resize previews floating target and saves only on pointerup",async()=>{
 const js=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
 const block=js.slice(js.indexOf("function beginEdgeResize("),js.indexOf("function beginPanelDrag("));
 assert.ok(!block.includes("reflowGridAfterResize("));
 assert.ok(js.includes("reflowGridAfterResize(previous,id,rect,dashboardConfig.widgets)"));
 assert.ok(block.includes("createPointerFrame(update)"));
 assert.ok(block.includes("pointer.finish(e);cleanup(e)"));
 assert.ok(block.includes("showFloatingGridTarget(next,stepX)"));
 assert.ok(!block.includes("applyGridPreview(positions)"));
 assert.ok(block.includes('edge.addEventListener("pointerup",finish)'));
 assert.ok(block.includes('saveGridPosition(id,next)'));
 assert.ok(!block.includes("render();"));
 assert.ok(js.includes("surface.setPointerCapture(event.pointerId)"));
 assert.ok(js.includes("layoutDraft={...layoutDraft,widths,positions}"));
 assert.ok(js.includes("if(type===\"resize\"&&state.report"));
 assert.ok(js.includes('closeLayoutEdit(false)'));
 assert.ok(js.includes('closeLayoutEdit(true)'));
});
test("all graph cards have one scroll body and hover-only controls",async()=>{
 const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
 const js=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
 assert.ok(js.includes('el("div","widget-scroll-body")'));
 assert.ok(css.includes('>.widget-scroll-body{'));
 assert.ok(css.includes('.widget-scroll-body .bars{max-height:none;overflow:visible}'));
 assert.ok(css.includes('.chart-header-controls{')&&css.includes('opacity:0;pointer-events:none;'));
 assert.ok(css.includes('@media(hover:none)'));
});
test("graph cards scroll inside consistently, not at two levels",async()=>{
 const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
 assert.ok(css.includes('.dashboard-grid>[data-widget]:not([data-widget="kpis"]){'));
 assert.ok(css.includes('min-width:0;overflow-y:auto;overflow-x:hidden;'));
 assert.ok(css.includes('scrollbar-gutter:stable'));
});
