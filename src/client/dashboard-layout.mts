// Strict TypeScript source for the public grid layout engine.
export type GridWidth = "half" | "full";
export interface GridRect { x: number; y: number; w: number; h: number }
export type GridPositions = Record<string, GridRect>;
export interface GridLayout { widths: Record<string, GridWidth>; positions: GridPositions }

// Twelve-column snap grid. Persist *only* integers, never arbitrary CSS or scripts.
export const GRID_COLUMNS=12;
export const GRID_MAX_ROW=400;
export const DEFAULT_WIDTHS=Object.freeze({kpis:"full",trend:"full",providers:"half",models:"half",cache:"half",guidance:"half",sessions:"full"});
export const DEFAULT_ROWS=Object.freeze({kpis:5,trend:15,providers:13,models:13,cache:9,guidance:9,sessions:19});
const record=(v: unknown): v is Record<string, any>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
export const minimumRows=(id: string): number=>id==="kpis"?4:id==="sessions"?10:id==="trend"?9:id==="cache"?6:id==="guidance"?5:6;
const defaultHeight=(id: string): number=>DEFAULT_ROWS[id]??11;
export function overlaps(a: GridRect,b: GridRect): boolean{
  return a.x < b.x+b.w && a.x+a.w>b.x && a.y < b.y+b.h && a.y+a.h>b.y;
}
function validRect(rect: unknown,id: string): GridRect{
  if(!record(rect)||Object.keys(rect).some(k=>!["x","y","w","h"].includes(k))||
    !["x","y","w","h"].every(k=>Number.isInteger(rect[k]))||
    rect.x<0||rect.x>=GRID_COLUMNS||rect.y<0||rect.y>GRID_MAX_ROW||
    rect.w<2||rect.w>GRID_COLUMNS||rect.x+rect.w>GRID_COLUMNS||
    rect.h<minimumRows(id)||rect.h>48||rect.y+rect.h>GRID_MAX_ROW+48){
    throw new Error("Invalid grid rectangle for "+id+".");
  }
  return {x:rect.x,y:rect.y,w:rect.w,h:rect.h};
}
function firstFree(placed: GridPositions,w: number,h: number,startY=0): GridRect{
  for(let y=startY;y<=GRID_MAX_ROW;y++){
    for(let x=0;x<=GRID_COLUMNS-w;x++){
      const candidate={x,y,w,h};
      if(!Object.values(placed).some(other=>overlaps(other,candidate)))return candidate;
    }
  }
  throw new Error("Dashboard grid is full.");
}
export function validateLayout(layout: any,registered: string[]=Object.keys(DEFAULT_WIDTHS),order: string[]=registered): GridLayout{
  if(layout!==undefined&&!record(layout))throw Error("Invalid dashboard layout.");
  if(Object.keys(layout??{}).some(k=>!["widths","positions"].includes(k)))
    throw Error("Unknown dashboard layout setting.");
  if(layout?.widths!==undefined&&!record(layout.widths))throw Error("Invalid widget widths.");
  if(layout?.positions!==undefined&&!record(layout.positions))throw Error("Invalid widget positions.");
  const known=new Set(registered);
  if(Object.keys(layout?.widths??{}).some(k=>!known.has(k))||
     Object.keys(layout?.positions??{}).some(k=>!known.has(k)))throw Error("Unknown layout widget.");
  const widths: Record<string, GridWidth>={};
  for(const id of registered){
    const width=layout?.widths?.[id]??DEFAULT_WIDTHS[id]??"half";
    if(!["half","full"].includes(width))throw Error("Invalid widget width.");
    if(id==="kpis"&&width!=="full")throw Error("Summary must stay full width.");
    widths[id]=width;
  }
  const positions: GridPositions={};
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
export function moveWidgetOrder(order: string[],moving: string,target: string): string[]{
  if(!Array.isArray(order)||new Set(order).size!==order.length||
    !order.includes(moving)||!order.includes(target))throw Error("Invalid widget move.");
  const result=[...order];result.splice(result.indexOf(moving),1);result.splice(result.indexOf(target),0,moving);
  return result;
}
export function relocateGridWidget(positions: GridPositions,id: string,next: GridRect,order: string[]=Object.keys(positions)): GridPositions{
  if(!record(positions)||!Object.hasOwn(positions,id))throw Error("Unknown grid widget.");
  const moved=validRect(next,id);
  const resolved: GridPositions={[id]:moved};
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
export function snapToGrid(clientX: number,clientY: number,rect: {left: number;top: number;width: number},width: number,height: number): GridRect{
  const stepX=(rect.width+8)/GRID_COLUMNS;
  const x=Math.max(0,Math.min(GRID_COLUMNS-width,Math.round((clientX-rect.left)/stepX)));
  const y=Math.max(0,Math.min(GRID_MAX_ROW,Math.round((clientY-rect.top)/32)));
  return {x,y,w:width,h:height};
}

export function cacheRowsForWidth(newWidthPx: number,oldWidthPx: number,rows: number): number{
  if(!Number.isFinite(newWidthPx)||!Number.isFinite(oldWidthPx)||!Number.isInteger(rows))
    throw Error("Invalid responsive cache dimensions.");
  if(oldWidthPx<680&&newWidthPx>=680&&rows===9)return 6;
  if(oldWidthPx>=680&&newWidthPx<680&&rows===6)return 9;
  return rows; // preserve manually customized heights
}

/** Return the visible order from snapped positions, independent of document order. */
export function visibleGridOrder(positions: GridPositions,visible: string[]): string[]{
  if(!record(positions)||!Array.isArray(visible))throw Error("Invalid visual grid order.");
  return visible.filter(id=>Object.hasOwn(positions,id))
    .sort((a,b)=>positions[a].y-positions[b].y||positions[a].x-positions[b].x||a.localeCompare(b));
}
/** Insert one widget immediately before/after its actual visual neighbor. */
export function moveWidgetByVisualOrder(positions: GridPositions,visible: string[],id: string,direction: -1|1): GridPositions|null{
  if(![-1,1].includes(direction))throw Error("Invalid grid movement.");
  const order=visibleGridOrder(positions,visible);
  const i=order.indexOf(id),neighbor=order[i+direction];
  if(i<0||!neighbor)return null;
  const moving=direction<0?id:neighbor;
  const destination=positions[direction<0?neighbor:id];
  const rect=positions[moving];
  return relocateGridWidget(positions,moving,
    {...rect,x:Math.min(destination.x,GRID_COLUMNS-rect.w),y:destination.y},order);
}
/** Fill holes only when visibility changes; hidden panels no longer reserve grid cells. */
export function compactVisibleLayout(positions: GridPositions,visible: string[],containerWidth=0): GridPositions{
  if(!record(positions)||!Array.isArray(visible)||new Set(visible).size!==visible.length||
    visible.some(id=>!Object.hasOwn(positions,id)))throw Error("Invalid visibility layout.");
  const all=Object.keys(positions),enabled=new Set(visible);
  const order=[...visibleGridOrder(positions,visible),
    ...visibleGridOrder(positions,all.filter(id=>!enabled.has(id)))];
  const placed: GridPositions={};
  for(const id of order){
    const before=validRect(positions[id],id);
    let {w,h}=before;
    if(id==="cache"&&!enabled.has("guidance")&&positions.guidance&&
       before.w===6&&positions.guidance.y===before.y&&
       Number.isFinite(containerWidth)&&containerWidth>0){
      const step=(containerWidth+8)/GRID_COLUMNS;
      h=cacheRowsForWidth(step*12-8,step*6-8,h);
      w=12;
    }
    placed[id]=firstFree(placed,w,h,0);
  }
  return Object.fromEntries(all.map(id=>[id,placed[id]]));
}

/** Reposition peers after resize, reclaiming rows made free by contraction. */
export function reflowGridAfterResize(positions: GridPositions,id: string,next: GridRect,order: string[]=Object.keys(positions)): GridPositions{
  if(!record(positions)||!Object.hasOwn(positions,id))throw Error("Unknown grid widget.");
  const before=validRect(positions[id],id),target=validRect(next,id);
  const release=Math.max(0,before.y+before.h-target.y-target.h);
  const sideRelease=target.w<before.w||target.x>before.x;
  const placed: GridPositions={[id]:target};
  const others=Object.keys(positions).filter(k=>k!==id).sort((a,b)=>
    positions[a].y-positions[b].y||positions[a].x-positions[b].x||
    order.indexOf(a)-order.indexOf(b));
  for(const id2 of others){
    const old=validRect(positions[id2],id2);
    let y=old.y;
    if(release&&old.y>=before.y+before.h)y=Math.max(0,y-release);
    if(sideRelease&&old.y>=before.y&&old.x<before.x+before.w&&
      old.x+old.w>before.x&&(old.x>=target.x+target.w||old.x+old.w<=target.x))
      y=Math.min(y,before.y);
    const candidate={...old,y};
    while(Object.values(placed).some(other=>overlaps(other,candidate))){
      candidate.y++;
      if(candidate.y>GRID_MAX_ROW)throw Error("Not enough grid space.");
    }
    placed[id2]=candidate;
  }
  return Object.fromEntries(Object.keys(positions).map(k=>[k,placed[k]]));
}
