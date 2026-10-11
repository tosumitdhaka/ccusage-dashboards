// Twelve-column snap grid. Persist *only* integers, never arbitrary CSS or scripts.
export const GRID_COLUMNS=12;
export const GRID_MAX_ROW=400;
export const DEFAULT_WIDTHS=Object.freeze({kpis:"full",trend:"full",providers:"half",models:"half",cache:"half",guidance:"half",sessions:"full"});
export const DEFAULT_ROWS=Object.freeze({kpis:5,trend:15,providers:13,models:13,cache:9,guidance:9,sessions:19});
const record=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
export const minimumRows=id=>id==="kpis"?4:id==="sessions"?10:id==="trend"?9:id==="cache"?6:id==="guidance"?5:6;
const defaultHeight=id=>DEFAULT_ROWS[id]??11;
export function overlaps(a,b){
  return a.x < b.x+b.w && a.x+a.w>b.x && a.y < b.y+b.h && a.y+a.h>b.y;
}
function validRect(rect,id){
  if(!record(rect)||Object.keys(rect).some(k=>!["x","y","w","h"].includes(k))||
    !["x","y","w","h"].every(k=>Number.isInteger(rect[k]))||
    rect.x<0||rect.x>=GRID_COLUMNS||rect.y<0||rect.y>GRID_MAX_ROW||
    rect.w<2||rect.w>GRID_COLUMNS||rect.x+rect.w>GRID_COLUMNS||
    rect.h<minimumRows(id)||rect.h>48||rect.y+rect.h>GRID_MAX_ROW+48){
    throw new Error("Invalid grid rectangle for "+id+".");
  }
  return {x:rect.x,y:rect.y,w:rect.w,h:rect.h};
}
function firstFree(placed,w,h,startY=0){
  for(let y=startY;y<=GRID_MAX_ROW;y++){
    for(let x=0;x<=GRID_COLUMNS-w;x++){
      const candidate={x,y,w,h};
      if(!Object.values(placed).some(other=>overlaps(other,candidate)))return candidate;
    }
  }
  throw new Error("Dashboard grid is full.");
}
export function validateLayout(layout,registered=Object.keys(DEFAULT_WIDTHS),order=registered){
  if(layout!==undefined&&!record(layout))throw Error("Invalid dashboard layout.");
  if(Object.keys(layout??{}).some(k=>!["widths","positions"].includes(k)))
    throw Error("Unknown dashboard layout setting.");
  if(layout?.widths!==undefined&&!record(layout.widths))throw Error("Invalid widget widths.");
  if(layout?.positions!==undefined&&!record(layout.positions))throw Error("Invalid widget positions.");
  const known=new Set(registered);
  if(Object.keys(layout?.widths??{}).some(k=>!known.has(k))||
     Object.keys(layout?.positions??{}).some(k=>!known.has(k)))throw Error("Unknown layout widget.");
  const widths={};
  for(const id of registered){
    const width=layout?.widths?.[id]??DEFAULT_WIDTHS[id]??"half";
    if(!["half","full"].includes(width))throw Error("Invalid widget width.");
    if(id==="kpis"&&width!=="full")throw Error("Summary must stay full width.");
    widths[id]=width;
  }
  const positions={};
  for(const [id,rect] of Object.entries(layout?.positions??{})){
    const candidate=validRect(rect,id);
    if(Object.values(positions).some(other=>overlaps(other,candidate)))
      throw Error("Overlapping grid widgets.");
    positions[id]=candidate;
  }
  // Legacy v0.2/v0.3 width-only layouts migrate without losing their size preference.
  const missing=order.filter(id=>known.has(id)&&!Object.hasOwn(positions,id));
  const remaining=registered.filter(id=>!missing.includes(id)&&!Object.hasOwn(positions,id));
  let cursor=Object.values(positions).reduce((end,rect)=>Math.max(end,rect.y+rect.h),0);
  for(const id of [...missing,...remaining]){
    const w=widths[id]==="full"?12:6,h=defaultHeight(id);
    const rect=firstFree(positions,w,h,cursor);
    positions[id]=rect;
    // Try same row for the next item, but fall through when a widget does not fit.
    cursor=rect.y;
  }
  return {widths,positions};
}
export function moveWidgetOrder(order,moving,target){
  if(!Array.isArray(order)||new Set(order).size!==order.length||
    !order.includes(moving)||!order.includes(target))throw Error("Invalid widget move.");
  const result=[...order];result.splice(result.indexOf(moving),1);result.splice(result.indexOf(target),0,moving);
  return result;
}
export function relocateGridWidget(positions,id,next,order=Object.keys(positions)){
  if(!record(positions)||!Object.hasOwn(positions,id))throw Error("Unknown grid widget.");
  const moved=validRect(next,id);
  const resolved={[id]:moved};
  const others=Object.keys(positions).filter(key=>key!==id);
  others.sort((a,b)=>(positions[a].y-positions[b].y)||(positions[a].x-positions[b].x)||
    order.indexOf(a)-order.indexOf(b));
  for(const other of others){
    const previous=validRect(positions[other],other);
    let proposal={...previous};
    while(Object.values(resolved).some(rect=>overlaps(rect,proposal))){
      proposal={...proposal,y:proposal.y+1};
      if(proposal.y>GRID_MAX_ROW)throw Error("Not enough grid space.");
    }
    resolved[other]=proposal;
  }
  return Object.fromEntries(Object.keys(positions).map(key=>[key,resolved[key]]));
}
export function snapToGrid(clientX,clientY,rect,width,height){
  const stepX=(rect.width+8)/GRID_COLUMNS;
  const x=Math.max(0,Math.min(GRID_COLUMNS-width,Math.round((clientX-rect.left)/stepX)));
  const y=Math.max(0,Math.min(GRID_MAX_ROW,Math.round((clientY-rect.top)/32)));
  return {x,y,w:width,h:height};
}
