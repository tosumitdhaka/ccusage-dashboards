import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("keyboard Escape safely cancels draft layout without stealing modal dismissal",async()=>{
  const ts=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  assert.match(ts,/event\.key!=="Escape"\|\|!arranging\|\|document\.querySelector\("dialog\[open\]"\)/);
  assert.match(ts,/closeLayoutEdit\(false\)/);
  assert.match(ts,/\.focus\(\{preventScroll:true\}\)/);
});
test("graph builder exposes its validation status to assistive technology",async()=>{
  const html=await readFile(new URL("./public/index.html",import.meta.url),"utf8");
  assert.match(html,/<form id="graph-form" aria-describedby="graph-status">/);
  assert.match(html,/id="graph-status" role="status" aria-live="polite"/);
});
