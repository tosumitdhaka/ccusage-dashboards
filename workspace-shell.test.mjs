import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("v0.4 workspace shell exposes responsive navigation and global filter controls", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("./public/index.html", import.meta.url), "utf8"),
    readFile(new URL("./public/styles.css", import.meta.url), "utf8")
  ]);
  for (const id of ["workspace-sidebar", "workspace-filter-toggle", "workspace-filter-panel", "agent", "model", "workspace-metric", "workspace-density", "active-filter-chips"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /class="period workspace-period[^"]*"[^>]*data-period="7d"/);
  assert.match(css, /@media \(min-width:768px\) and \(max-width:1279px\)/);
  assert.match(css, /@media \(max-width:767px\)/);
  assert.match(css, /html\[data-sidebar="collapsed"\]/);
});

test("workspace discloses report-relative UTC windows and stale history", async () => {
  const html = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
  const code = await readFile(new URL("./src/client/dashboard.ts", import.meta.url), "utf8");
  assert.match(html,/id="workspace-range"/);
  assert.match(code,/Report-relative UTC:/);
  assert.match(code,/Last observed/);
  assert.match(code,/Comparison unavailable/);
});

test("server allowlists every required local browser module", async () => {
  const source=await readFile(new URL("./src/node/server.mts",import.meta.url),"utf8");
  const runtime=await readFile(new URL("./server.mjs",import.meta.url),"utf8");
  for(const file of ["workspace-state.mjs","filter-controller.mjs","chart-interaction.mjs","formatting.mjs"]) {
    assert.ok(source.includes('"/'+file+'"'),file+" missing from TypeScript asset map");
    assert.ok(runtime.includes('"/'+file+'"'),file+" missing from runtime asset map");
  }
});
