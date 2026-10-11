// Whitelisted, data-only widget layout. No CSS or executable expressions accepted.
export const DEFAULT_WIDTHS=Object.freeze({kpis:"full",trend:"full",providers:"half",models:"half",cache:"half",guidance:"half",sessions:"full"});
const record=(v)=>v!==null&&typeof v==="object"&&!Array.isArray(v);
export function validateLayout(layout,registered=Object.keys(DEFAULT_WIDTHS)){
  if(layout!==undefined&&!record(layout))throw Error("Invalid dashboard layout.");
  if(Object.keys(layout??{}).some(k=>k!=="widths"))throw Error("Unknown dashboard layout setting.");
  if(layout?.widths!==undefined&&!record(layout.widths))throw Error("Invalid widget widths.");
  const known=new Set(registered);
  if(Object.keys(layout?.widths??{}).some(k=>!known.has(k)||!Object.hasOwn(DEFAULT_WIDTHS,k)))
    throw Error("Unknown layout widget.");
  const widths={};
  for(const id of registered){
    const value=layout?.widths?.[id]??DEFAULT_WIDTHS[id];
    if(!["half","full"].includes(value))throw Error("Invalid widget width.");
    if(id==="kpis"&&value!=="full")throw Error("Summary must stay full width.");
    widths[id]=value;
  }
  return {widths};
}
export function moveWidgetOrder(order,moving,target){
  if(!Array.isArray(order)||new Set(order).size!==order.length||!order.includes(moving)||!order.includes(target))
    throw Error("Invalid widget move.");
  const result=[...order];result.splice(result.indexOf(moving),1);result.splice(result.indexOf(target),0,moving);
  return result;
}
