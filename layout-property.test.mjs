import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_DASHBOARD,validateDashboardConfig} from "./public/widget-registry.mjs";
import {GRID_COLUMNS,GRID_MAX_ROW,overlaps,relocateGridWidget,reflowGridAfterResize,compactVisibleLayout,validateLayout} from "./public/dashboard-layout.mjs";

const baseline=validateDashboardConfig(DEFAULT_DASHBOARD).layout.positions;
function valid(positions){
  const values=Object.values(positions);
  for(const item of values){
    assert.ok(Number.isInteger(item.x)&&Number.isInteger(item.y)&&Number.isInteger(item.w)&&Number.isInteger(item.h));
    assert.ok(item.x>=0&&item.x+item.w<=GRID_COLUMNS&&item.y>=0&&item.y<=GRID_MAX_ROW&&item.h>0);
  }
  for(let i=0;i<values.length;i++)for(let j=i+1;j<values.length;j++)
    assert.equal(overlaps(values[i],values[j]),false,"No two panels may overlap");
}
test("deterministic collision chains, repeated moves and resize reversals preserve invariants",()=>{
  let positions=structuredClone(baseline);
  let seed=0x5eed;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const ids=Object.keys(positions);
  for(let i=0;i<100;i++){
    const id=ids[rand()%ids.length],old=positions[id];
    const target={...old,x:Math.min(GRID_COLUMNS-old.w,rand()%GRID_COLUMNS),y:rand()%50};
    const before=structuredClone(positions);
    positions=relocateGridWidget(positions,id,target,ids);
    valid(positions);
    assert.deepEqual(positions,relocateGridWidget(before,id,target,ids),"Identical input must produce identical result");
    if(i%4===0){
      const grow={...positions[id],h:Math.min(48,positions[id].h+1)};
      positions=reflowGridAfterResize(positions,id,grow,ids);
      valid(positions);
      const shrink={...positions[id],h:old.h};
      positions=reflowGridAfterResize(positions,id,shrink,ids);
      valid(positions);
    }
  }
});
test("visibility compaction preserves every registered widget and does not alter inputs",()=>{
  const before=structuredClone(baseline);
  for(const visible of [["kpis","trend"],["kpis","providers","models"],Object.keys(before)]){
    const result=compactVisibleLayout(before,visible,1200);
    valid(result);
    assert.deepEqual(Object.keys(result),Object.keys(before));
    assert.deepEqual(result,compactVisibleLayout(before,visible,1200));
  }
  assert.deepEqual(baseline,before);
});
test("invalid targets and exhausted grid fail without mutating the original state",()=>{
  const before=structuredClone(baseline);
  assert.throws(()=>relocateGridWidget(before,"kpis",{x:1,y:0,w:12,h:5}),/Invalid grid/);
  assert.throws(()=>relocateGridWidget(before,"nonexistent",{x:0,y:0,w:6,h:10}),/Unknown grid/);
  assert.throws(()=>validateLayout({positions:{kpis:{x:0,y:0,w:12,h:5},trend:{x:0,y:0,w:12,h:9}}}),/Overlapping/);
  assert.deepEqual(before,baseline);
});
