import {DEFAULT_DASHBOARD,validateDashboardConfig,type DashboardConfig} from "./widget-registry.mjs";
// Curated workspace arrangements, separate from graph configuration presets.
export const DASHBOARD_LAYOUT_PRESETS = Object.freeze([
  {id:"executive",title:"Executive / Cost Overview",widgets:["kpis","trend","providers","cache"]},
  {id:"developer",title:"Developer / Model Deep Dive",widgets:["kpis","trend","models","cache","guidance"]},
  {id:"sessions",title:"Agent Session Debugger",widgets:["kpis","sessions","providers","models","guidance"]}
]);
export function applyDashboardLayoutPreset(base: DashboardConfig,id: string): DashboardConfig {
  const preset=DASHBOARD_LAYOUT_PRESETS.find(p=>p.id===id);
  if(!preset) throw Error("Unknown dashboard layout preset.");
  // Validate the source before any draft mutation. Layout is rebuilt deterministically
  // in preset order; custom charts stay registered but are not automatically visible.
  const source=validateDashboardConfig(base);
  return validateDashboardConfig({...source,title:preset.title,widgets:[...preset.widgets],
    layout:{widths:{...DEFAULT_DASHBOARD.layout.widths},positions:{}}});
}
