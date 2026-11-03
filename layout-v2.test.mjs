import test from "node:test";
import assert from "node:assert/strict";
import {pointerToGridDelta} from "./public/dashboard-layout.mjs";

test("logical grid conversion uses measured column and row sizes",()=>{
  const origin={x:200,y:300};
  assert.deepEqual(pointerToGridDelta(origin,{x:280,y:364},{columnStep:100,rowStep:32}),
    {x:1,y:2,dx:80,dy:64});
  assert.deepEqual(pointerToGridDelta(origin,{x:280,y:364},{columnStep:200,rowStep:64}),
    {x:0,y:1,dx:80,dy:64});
  assert.deepEqual(pointerToGridDelta(origin,{x:120,y:236},{columnStep:100,rowStep:32}),
    {x:-1,y:-2,dx:-80,dy:-64});
});
test("invalid pointer geometry fails before layout mutation",()=>{
  for(const measured of [{columnStep:0,rowStep:32},{columnStep:100,rowStep:NaN},{columnStep:-1,rowStep:32}]){
    assert.throws(()=>pointerToGridDelta({x:0,y:0},{x:4,y:8},measured),/geometry/);
  }
});
