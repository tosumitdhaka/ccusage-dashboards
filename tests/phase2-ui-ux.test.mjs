import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("public/styles.css has high contrast color values and accessible focus indicators", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

  // Check balanced braces
  const openCount = (css.match(/\{/g) || []).length;
  const closeCount = (css.match(/\}/g) || []).length;
  assert.equal(openCount, closeCount, "CSS brace balance check failed");

  // Verify WCAG 2.1 AA elevated contrast colors
  assert.ok(css.includes(".footnote{font-size:10px;line-height:1.6;color:#94a7bd}"), "Expected elevated footnote color #94a7bd");
  assert.ok(!css.includes("color:#70849b"), "Outdated low-contrast footnote color #70849b must not be present");

  assert.ok(css.includes(".identity small{display:block;font-size:9px;font-weight:650;color:#8ea0b8"), "Expected elevated identity small color #8ea0b8");
  assert.ok(!css.includes("color:#5d758c"), "Outdated low-contrast identity small color #5d758c must not be present");

  assert.ok(css.includes(".nav-caption{color:#8ea0b8;"), "Expected elevated nav-caption color #8ea0b8");
  assert.ok(!css.includes("color:#6a7a92"), "Outdated low-contrast nav-caption color #6a7a92 must not be present");

  assert.ok(css.includes(".kpi p{color:#94a5bc;font-size:11px;margin:0}"), "Expected elevated kpi p color #94a5bc");
  assert.ok(!css.includes("color:#77869b"), "Outdated low-contrast kpi p color #77869b must not be present");

  // Verify focus indicator includes select and .nav-link
  assert.match(
    css,
    /button:focus-visible,select:focus-visible,\.nav-link:focus-visible,input:focus-visible,\.import-button:focus-within\{outline:2px solid #53d5bd;outline-offset:2px\}/,
    "Expected select and .nav-link focus-visible rules with #53d5bd outline"
  );
});

test("public/index.html includes accessible table-wrap region, column headers, and autofocus", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  // Verify table-wrap accessibility attributes
  assert.match(
    html,
    /<div class="table-wrap" tabindex="0" role="region" aria-label="Recent session activity table">/,
    "Expected table-wrap to have tabindex='0', role='region', and aria-label"
  );

  // Verify th elements have scope="col"
  assert.ok(html.includes('<th scope="col">Agent</th>'), "Missing scope='col' on Agent header");
  assert.ok(html.includes('<th scope="col">Session</th>'), "Missing scope='col' on Session header");
  assert.ok(html.includes('<th scope="col">Reported tokens</th>'), "Missing scope='col' on Reported tokens header");
  assert.ok(html.includes('<th scope="col">API-equivalent</th>'), "Missing scope='col' on API-equivalent header");
  assert.ok(html.includes('<th scope="col">Last activity</th>'), "Missing scope='col' on Last activity header");

  // Verify autofocus on primary modal dialog inputs
  assert.match(html, /<input id="dashboard-title"[^>]*\bautofocus\b/, "Expected autofocus on #dashboard-title");
  assert.match(html, /<input id="graph-title"[^>]*\bautofocus\b/, "Expected autofocus on #graph-title");
});

test("dialog backdrop dismiss listener is wired in dashboard.ts and public/dashboard.js", async () => {
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");

  for (const code of [ts, js]) {
    assert.match(code, /querySelectorAll(?:<[^>]+>)?\(["']dialog["']\)/, "Expected querySelectorAll for dialog elements");
    assert.match(code, /rect\.left/, "Expected dialog clientX left bound check");
    assert.match(code, /rect\.right/, "Expected dialog clientX right bound check");
    assert.match(code, /rect\.top/, "Expected dialog clientY top bound check");
    assert.match(code, /rect\.bottom/, "Expected dialog clientY bottom bound check");
    assert.match(code, /dialog\.close\(\)/, "Expected dialog.close() call on outside backdrop click");
  }
});


test("mobile navigation drawer toggle button and drawer styling are wired", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const ts = await readFile(new URL("../src/client/dashboard.ts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");

  assert.match(html, /<button id="mobile-nav-toggle" class="mobile-nav-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="workspace-sidebar"[^>]*aria-label="Open navigation"[^>]*>/);
  assert.match(html, /<aside id="workspace-sidebar" class="sidebar"/);
  assert.ok(css.includes("@media (max-width:767px)"), "Expected v0.4 mobile breakpoint");
  assert.ok(css.includes(".sidebar.is-open{transform:translateX(0)}"), "Expected off-canvas drawer open state");

  for (const code of [ts, js]) {
    assert.match(code, /mobile-nav-toggle/, "Expected mobile-nav-toggle element lookup");
    assert.match(code, /aria-expanded/, "Expected aria-expanded update");
    assert.match(code, /classList\.(?:toggle|remove)\(["']is-open["']\)/, "Expected is-open class toggling");
  }
});

test("synchronized chart interaction engine owns tooltip, crosshair, hover and keyboard wiring", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const ts = await readFile(new URL("../src/client/chart-interaction.mts", import.meta.url), "utf8");
  const js = await readFile(new URL("../public/chart-interaction.mjs", import.meta.url), "utf8");

  assert.ok(css.includes(".chart-crosshair"), "Expected synchronized vertical crosshair styling");
  assert.ok(css.includes(".chart-tooltip-series"), "Expected shared all-series tooltip styling");
  assert.ok(css.includes(".chart-series-line.is-dimmed"), "Expected hover emphasis styling");

  for (const code of [ts, js]) {
    assert.match(code, /ensureTooltip/, "Interaction module should own a shared tooltip");
    assert.match(code, /requestAnimationFrame/, "Pointer crosshair updates must be RAF batched");
    assert.match(code, /pointermove[^\n]*passive:\s*true/s, "Pointer movement must remain passive");
    assert.match(code, /pointerenter/, "Expected series hover emphasis wiring");
    assert.match(code, /ArrowLeft/, "Expected keyboard point navigation");
    assert.match(code, /ArrowUp/, "Expected keyboard series navigation");
  }
});
