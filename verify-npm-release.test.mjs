import test from "node:test";
import assert from "node:assert/strict";
import {registryState} from "./scripts/verify-npm-release.mjs";
const src={name:"ccusage-dashboards",version:"0.2.0",shasum:"a".repeat(40)};
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});
test("unpublished npm version is absent",async()=>{
  assert.equal(await registryState({...src,fetcher:async()=>response(404)}),"absent");
});
test("only identical tarball may resume release",async()=>{
  assert.equal(await registryState({...src,fetcher:async()=>response(200,{...src,dist:{shasum:src.shasum}})}),"present");
  await assert.rejects(registryState({...src,fetcher:async()=>response(200,{...src,dist:{shasum:"b".repeat(40)}})}),/conflicts/);
});
test("registry failure and invalid identity fail closed",async()=>{
  await assert.rejects(registryState({...src,fetcher:async()=>response(503)}),/503/);
  await assert.rejects(registryState({...src,version:"latest",fetcher:async()=>response(404)}),/identity/);
});
test("registry retry tolerates short post-publication delay",async()=>{
  let call=0;
  const state=await registryState({...src,attempts:2,pause:async()=>{},fetcher:async()=>++call===1?response(404):response(200,{...src,dist:{shasum:src.shasum}})});
  assert.equal(state,"present"); assert.equal(call,2);
});
