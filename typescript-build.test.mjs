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

test("all application TypeScript projects enforce strict checks without suppression",async()=>{
  const paths=["tsconfig.client.json","tsconfig.dashboard.json","tsconfig.node.json"];
  for(const path of paths){
    const raw=await readFile(new URL("./"+path,import.meta.url),"utf8");
    const config=JSON.parse(raw);
    assert.equal(config.compilerOptions.strict,true,path+" must enforce full strict mode");
    assert.equal(config.compilerOptions.noEmitOnError,true,path+" must refuse broken output");
    assert.notEqual(config.compilerOptions.noImplicitAny,false,path+" must reject implicit any");
  }
  const controller=await readFile(new URL("./src/client/dashboard.ts",import.meta.url),"utf8");
  assert.doesNotMatch(controller,/\/\/\s*@ts-nocheck|\/\/\s*@ts-ignore|\/\/\s*@ts-expect-error/);
});
