import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("unlocked grid offers eight edge resize zones without cluttering widget controls",async()=>{
 const js=await readFile(new URL("./public/dashboard.js",import.meta.url),"utf8");
 const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
 const html=await readFile(new URL("./public/index.html",import.meta.url),"utf8");
 assert.ok(html.includes(">🔒 Layout Locked</button>"));
 assert.ok(js.includes('arranging?"🔓 Layout Unlocked":"🔒 Layout Locked"'));
 assert.ok(js.includes('["⌃",-1],["⌄",1]'));
 assert.ok(js.includes('["n","s","e","w","ne","nw","se","sw"]'));
 assert.ok(js.includes('edge.addEventListener("pointerdown"'));
 assert.ok(js.includes('edge.setPointerCapture(event.pointerId)'));
 assert.ok(!js.includes('el("span","layout-handle"'));
 assert.ok(!js.includes('el("button","layout-resize"'));
 assert.ok(css.includes(".dashboard-grid .edge-ne"));
 assert.ok(css.includes(".dashboard-grid .edge-sw"));
 assert.ok(css.includes(".dashboard-grid .layout-resize-edge:hover"));
});

test("live resize updates preview only and saves on pointerup",async()=>{
 const js=await readFile(new URL("./public/dashboard.js",import.meta.url),"utf8");
 const block=js.slice(js.indexOf("function beginEdgeResize("),js.indexOf("function installLayoutEditor()"));
 assert.ok(block.includes("positionResizePreview(ghost,next,step)"));
 assert.ok(block.includes('requestAnimationFrame('));
 assert.ok(block.includes('edge.addEventListener("pointerup",finish)'));
 assert.ok(block.includes('saveGridPosition(id,next)'));
 assert.ok(!block.includes("render();"));
 assert.ok(!block.includes("panel.style.gridRow="));
 assert.ok(js.includes('ghost.id="grid-resize-preview"'));
});

test("models list has only the inner vertical scrollbar",async()=>{
 const css=await readFile(new URL("./public/styles.css",import.meta.url),"utf8");
 assert.ok(css.includes('.dashboard-grid>[data-widget="models"]{display:flex;flex-direction:column;overflow:hidden}'));
 assert.ok(css.includes('.dashboard-grid>[data-widget="models"]>#model-bars{flex:1 1 auto;min-height:0;'));
 assert.ok(css.includes('max-height:none;overflow-y:auto;overflow-x:hidden'));
 assert.ok(css.includes('@media(max-width:1050px)'));
});
