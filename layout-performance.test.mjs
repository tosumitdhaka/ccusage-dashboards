import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("pointer move coalesces collisions at one RAF and flushes pointerup",async()=>{
  const js=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  const section=js.slice(js.indexOf("function createPointerFrame("),js.indexOf("function installLayoutEditor("));
  assert.ok(section.includes("if(!frame)frame=requestAnimationFrame("));
  assert.ok(section.includes("update(latestX,latestY)"));
  assert.ok(section.includes("frame=0;update(e.clientX,e.clientY)"));
  assert.ok(section.includes("start.x+Math.round(dx/stepX)"));
  assert.ok(section.includes("start.y+Math.round(dy/32)"));
  assert.ok(section.includes("panel.style.transform="));
  assert.ok(section.includes("showFloatingGridTarget(next,stepX)"));
  assert.ok(section.includes("const pointer=createPointerFrame(update)"));
  assert.ok(!section.includes("scheduleLayoutPreview(positions)"));
  assert.ok(js.includes('if(type==="resize"&&state.report'));
  assert.match(js,/applyGridPreview\(positions\);\s*\/\/ Moving a card/);
});

test("native document wheel continues from graph and exhausted list scroll regions",async()=>{
  const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
  const js=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  const hover=css.slice(css.indexOf("/* Settings and edit affordances"));
  assert.ok(hover.includes("opacity:1;visibility:visible;pointer-events:auto"));
  assert.match(css,/\.widget-scroll-body\{[\s\S]*?overscroll-behavior-y:auto/);
  assert.ok(css.includes('[data-widget="trend"]'));
  assert.ok(js.includes("panel.dataset.chartVisual=chart.visual"));
  assert.ok(!js.includes("{passive:false,capture:true}"));
  assert.ok(!js.includes("page.scrollTop+=event.deltaY*scale"));
  assert.ok(js.includes("body.tabIndex=0"));
  assert.ok(css.includes("html{scroll-behavior:auto}"));
  assert.ok(!css.includes("html{scroll-behavior:smooth}"));
  assert.doesNotMatch(css,/\.widget-scroll-body\{[^}]*overscroll-behavior:contain/);
});

test("only resized line charts regenerate SVG; moves do not rerender whole dashboard",async()=>{
  const js=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  const block=js.slice(js.indexOf("function saveGridPosition("),js.indexOf("function beginLayoutEdit("));
  assert.ok(block.includes("applyGridPreview(positions)"));
  assert.ok(!block.includes("if(state.report)render()"));
  assert.ok(block.includes('if(id==="trend")'));
  assert.ok(block.includes("drawLineChart(chart,state.metric)"));
});

test("floating drag and resize leave peer layout unchanged until pointerup",async()=>{
  const src=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  const resize=src.slice(src.indexOf("function beginEdgeResize("),src.indexOf("function beginPanelDrag("));
  const drag=src.slice(src.indexOf("function beginPanelDrag("),src.indexOf("function installLayoutEditor("));
  assert.ok(resize.includes("showFloatingGridTarget(next,stepX)"));
  assert.ok(drag.includes("panel.style.transform="));
  assert.ok(drag.includes('saveGridPosition(id,next,"drag")'));
  assert.ok(resize.includes("saveGridPosition(id,next)"));
  assert.ok(!resize.includes("relocateGridWidget("));
  assert.ok(!drag.includes("relocateGridWidget("));
  assert.ok(!resize.includes("reflowGridAfterResize("));
  assert.ok(!drag.includes("reflowGridAfterResize("));
  const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
  assert.match(css,/\.dashboard-grid \.layout-drop-preview\{\s*position:absolute/);
  assert.ok(css.includes("pointer-events:none;transition:none!important;"));
});

test("configuration controls remain visible without hover support",async()=>{
  const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
  assert.match(css,/\.dashboard-grid>\[data-widget\] \.viz-menu-trigger,\s*\.dashboard-grid>\[data-widget\] \.chart-header-controls\s*\{[^}]*opacity:1;visibility:visible;pointer-events:auto/);
  assert.ok(!css.includes("opacity:0;pointer-events:none;"));
  assert.ok(css.includes(".top-actions #customize{visibility:visible"));
});

test("drag gain is shared by preview and snap coordinates",async()=>{
  const js=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  assert.ok(js.includes("const DRAG_SENSITIVITY=1.0;"));
  assert.ok(js.includes("const dx=(x-x0)*DRAG_SENSITIVITY,dy=(y-y0)*DRAG_SENSITIVITY;"));
  assert.ok(js.includes("start.x+Math.round(dx/stepX)"));
  assert.ok(js.includes("start.y+Math.round(dy/32)"));
  assert.ok(js.includes('panel.style.transform="translate3d("+dx+"px,"+dy+"px,0)"'));
});
