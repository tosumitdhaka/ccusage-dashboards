import test from "node:test";
import assert from "node:assert/strict";
import {validateLayout,overlaps,reflowGridAfterResize} from "./public/dashboard-layout.mjs";
test("growing then shrinking summary pulls following panels back into released rows",()=>{
  const positions={
    kpis:{x:0,y:0,w:12,h:5},
    trend:{x:0,y:5,w:12,h:15},
    providers:{x:0,y:20,w:6,h:13},models:{x:6,y:20,w:6,h:13}
  };
  const grown=reflowGridAfterResize(positions,"kpis",{...positions.kpis,h:9});
  assert.equal(grown.trend.y,9);
  assert.equal(grown.providers.y,24);
  const shrunk=reflowGridAfterResize(grown,"kpis",{...positions.kpis});
  assert.equal(shrunk.trend.y,5);
  assert.equal(shrunk.providers.y,20);
  assert.equal(shrunk.models.y,20);
  validateLayout({positions:shrunk},Object.keys(shrunk));
});
test("sideways resize and repeated no-op preserves strict non-overlap",()=>{
  const start={kpis:{x:0,y:0,w:12,h:5},providers:{x:0,y:5,w:6,h:13},models:{x:6,y:5,w:6,h:13}};
  const moved=reflowGridAfterResize(start,"providers",{...start.providers,w:8});
  for(const [a,ra] of Object.entries(moved))
    for(const [b,rb] of Object.entries(moved))if(a!==b)assert.equal(overlaps(ra,rb),false);
  assert.deepEqual(reflowGridAfterResize(start,"providers",start.providers),start);
  assert.throws(()=>reflowGridAfterResize(start,"kpis",{...start.kpis,h:0}),/rectangle/);
});
