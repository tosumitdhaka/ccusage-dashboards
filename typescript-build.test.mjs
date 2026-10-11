import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {validateLayout,reflowGridAfterResize} from "./public/dashboard-layout.mjs";
import {colorForDimension,labelPointIndices} from "./public/chart-presentation.mjs";

test("TypeScript layout sources preserve public ESM API and type safety",async()=>{
  const pkg=JSON.parse(await readFile(new URL("./package.json",import.meta.url),"utf8"));
  const ts=JSON.parse(await readFile(new URL("./tsconfig.client.json",import.meta.url),"utf8"));
  const layout=await readFile(new URL("./src/client/dashboard-layout.mts",import.meta.url),"utf8");
  assert.equal(pkg.devDependencies.typescript,"5.8.3");
  assert.ok(pkg.scripts.check.includes("npm run typecheck"));
  assert.equal(ts.compilerOptions.strict,true);
  assert.equal(ts.compilerOptions.noEmitOnError,true);
  assert.ok(layout.includes("interface GridRect"));
  const origin={kpis:{x:0,y:0,w:12,h:5},trend:{x:0,y:5,w:12,h:15}};
  const updated=reflowGridAfterResize(origin,"kpis",{...origin.kpis,h:9});
  assert.equal(updated.trend.y,9);
  assert.equal(validateLayout({positions:updated}).positions.trend.y,9);
  assert.equal(colorForDimension("codex"),"#53d6be");
  assert.deepEqual(labelPointIndices(1),[0]);
});
