import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("pointer move coalesces collisions at one RAF and flushes pointerup",async()=>{
  const js=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  const section=js.slice(js.indexOf("function createPointerFrame("),js.indexOf("function installLayoutEditor("));
  assert.ok(section.includes("if(!frame)frame=requestAnimationFrame("));
  assert.ok(section.includes("update(latestX,latestY)"));
  assert.ok(section.includes("frame=0;update(e.clientX,e.clientY)"));
  assert.ok(section.includes("const gridBounds=grid.getBoundingClientRect()"));
  assert.ok(section.includes("snapToGrid(x-offset.x,y-offset.y,gridBounds"));
  assert.ok(section.includes("const pointer=createPointerFrame(update)"));
  assert.ok(!section.includes("scheduleLayoutPreview(positions)"));
  assert.ok(js.includes('if(type==="resize"&&state.report'));
  assert.ok(js.includes('applyGridPreview(positions);\n  // Moving a card'));
});

test("native document wheel continues from graph and exhausted list scroll regions",async()=>{
  const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
  const js=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  const hover=css.slice(css.indexOf("/* Reveal editing controls"));
  assert.match(hover,/transition:opacity 130ms ease\s*\}/);
  assert.match(css,/\.widget-scroll-body\{[\s\S]*?overscroll-behavior-y:auto/);
  assert.ok(css.includes('[data-widget="trend"]>.widget-scroll-body'));
  assert.ok(css.includes('[data-chart-visual="line"]>.widget-scroll-body'));
  assert.ok(js.includes("panel.dataset.chartVisual=chart.visual"));
  assert.ok(!js.includes('addEventListener("wheel"'));
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
