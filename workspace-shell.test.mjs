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
