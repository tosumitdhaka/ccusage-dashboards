import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_DASHBOARD,validateDashboardConfig} from "./public/widget-registry.mjs";
import {DASHBOARD_LAYOUT_PRESETS,applyDashboardLayoutPreset} from "./public/dashboard-presets.mjs";
import {overlaps} from "./public/dashboard-layout.mjs";
test("each named workspace preset yields validated deterministic, collision-free layout",()=>{
  const baseline=validateDashboardConfig(DEFAULT_DASHBOARD);
  for(const {id,widgets} of DASHBOARD_LAYOUT_PRESETS){
    const result=applyDashboardLayoutPreset(baseline,id);
    assert.deepEqual(result.widgets,widgets);
    assert.deepEqual(result,applyDashboardLayoutPreset(baseline,id));
    const visible=widgets.map(k=>result.layout.positions[k]);
    for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++)
      assert.equal(overlaps(visible[i],visible[j]),false);
    assert.deepEqual(baseline,validateDashboardConfig(DEFAULT_DASHBOARD));
  }
  assert.throws(()=>applyDashboardLayoutPreset(baseline,"invalid"),/Unknown dashboard layout/);
});
