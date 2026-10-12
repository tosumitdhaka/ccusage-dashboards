// Diagnostic-only Chrome capture: populated synthetic report; never uses user logs.
// Emits screenshot JPEG plus measurements to CI logs for independent inspection.
import {spawn,spawnSync} from "node:child_process";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {startDashboardServer} from "../server.mjs";
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const bins=[process.env.CHROME_BIN,"google-chrome","google-chrome-stable","chromium","chromium-browser"].filter(Boolean);
const chrome=bins.find(bin=>spawnSync(bin,["--version"],{stdio:"ignore"}).status===0);
if(!chrome)throw Error("Chrome unavailable");
const modelNames=["gpt-6","gpt-5.6","gpt-5.5","o4","o3","claude-sonnet-4.5","claude-opus-4.1","claude-haiku-4.5","gemini-3.5-pro","gemini-3.5-flash","gemini-3-pro","deepseek-r1","qwen-3","llama-4","mistral","codestral","other-1","other-2"];
const names=["codex","claude","antigravity"];
const models=(agent,day)=>modelNames.map((modelName,i)=>({modelName,inputTokens:1900+i*110+day*13,outputTokens:880+i*73,cacheReadTokens:970+i*36,cacheCreationTokens:90+i*9,cost:0.006+i*.003,missingPricing:false}));
const report={
 daily:Array.from({length:26},(_,day)=>{
  const agents=names.map((agent,i)=>({agent,totalTokens:100000+i*19000+day*2200,totalCost:6+i*2+day*.1,inputTokens:50000,outputTokens:32000,cacheReadTokens:16000,cacheCreationTokens:2000,modelBreakdowns:models(agent,day)}));
  return {period:new Date(Date.UTC(2026,8,1+day)).toISOString().slice(0,10),agent:"all",agents,totalTokens:agents.reduce((s,a)=>s+a.totalTokens,0),totalCost:agents.reduce((s,a)=>s+a.totalCost,0),
   inputTokens:151000,outputTokens:96000,cacheReadTokens:48000,cacheCreationTokens:6000,modelBreakdowns:models("all",day)};
 }),
 weekly:[],monthly:[],
 session:Array.from({length:12},(_,i)=>({period:"session-"+i,session:"session-"+i,agent:names[i%3],totalTokens:15000+i*2700,totalCost:2+i*.4,inputTokens:8700,outputTokens:4200,modelBreakdowns:[models("codex",i)[i]]}))
};
const temp=await mkdtemp(join(tmpdir(),"ccusage-audit-"));
let browser,server,socket;
try{
 server=await startDashboardServer({port:0,collect:async()=>report});
 const url="http://127.0.0.1:"+server.address().port;
 browser=spawn(chrome,["--headless=new","--disable-gpu","--no-sandbox","--disable-dev-shm-usage","--no-first-run","--no-default-browser-check","--no-proxy-server","--remote-debugging-port=0","--user-data-dir="+temp,"about:blank"],{stdio:["ignore","ignore","pipe"]});
 let port;
 for(let i=0;i<100&&!port;i++){
  if(browser.exitCode!==null)throw Error("Chrome quit during startup");
  try{port=Number((await readFile(join(temp,"DevToolsActivePort"),"utf8")).split("\n")[0]);}catch{await delay(100);}
 }
 if(!port)throw Error("Chrome DevTools unavailable");
 const tabs=await (await fetch("http://127.0.0.1:"+port+"/json")).json();
 socket=new WebSocket(tabs.find(x=>x.type==="page").webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
 let seq=0;const pending=new Map();
 socket.addEventListener("message",e=>{const m=JSON.parse(e.data);if(!m.id||!pending.has(m.id))return;const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const run=async(expression)=>{const x=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(x.exceptionDetails)throw Error("Eval: "+JSON.stringify(x.exceptionDetails));return x.result?.value;};
 const capture=async(tag)=>{const x=await call("Page.captureScreenshot",{format:"jpeg",quality:45,captureBeyondViewport:false,fromSurface:true});console.log("UI_AUDIT_SCREENSHOT_"+tag+":"+x.data);};
 await call("Page.enable");await call("Runtime.enable");
 await call("Emulation.setDeviceMetricsOverride",{width:1440,height:850,deviceScaleFactor:1,mobile:false});
 await call("Page.navigate",{url});
 let loaded=false;
 for(let i=0;i<120;i++){try{loaded=await run('document.querySelector("#stat-tokens")?.textContent!=="—" && document.querySelector("#notice")?.hidden && !!document.querySelector(\'[data-widget="trend"] .viz-menu-trigger\')');}catch{}if(loaded)break;await delay(100);}
 if(!loaded)throw Error("Populated report did not render: "+await run("document.querySelector('#notice')?.textContent"));
 await capture("TOP");
 const summary=await run(`(()=>{
  const sel=(q)=>document.querySelector(q);
  const elements={};
  for(const id of ['trend','providers','models','cache','sessions']){
    const card=sel('[data-widget="'+id+'"]'),body=card?.querySelector('.widget-scroll-body');
    const menu=card?.querySelector('.viz-menu-trigger'),controls=card?.querySelector('.chart-header-controls');
    const box=e=>e?{x:Math.round(e.getBoundingClientRect().x),y:Math.round(e.getBoundingClientRect().y),width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height),clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,scrollTop:e.scrollTop,overflowY:getComputedStyle(e).overflowY,overscrollY:getComputedStyle(e).overscrollBehaviorY,opacity:getComputedStyle(e).opacity,pointerEvents:getComputedStyle(e).pointerEvents}:null;
    elements[id]={card:box(card),body:box(body),menu:box(menu),controls:box(controls),bars:box(card?.querySelector('.bars'))};
  }
  return {root:{height:document.scrollingElement.scrollHeight,clientHeight:document.scrollingElement.clientHeight,scrollTop:document.scrollingElement.scrollTop},viewport:innerWidth,href:location.href,elements};
 })()`);
 console.log("UI_AUDIT_LAYOUT:"+JSON.stringify(summary));
 const smoothAudit=await run(`(async()=>{
  const root=document.scrollingElement,html=document.documentElement;
  const before={behavior:getComputedStyle(html).scrollBehavior,scrollTop:root.scrollTop};
  root.scrollTop=400;
  const immediately=root.scrollTop;
  await new Promise(resolve=>setTimeout(resolve,75));const after75=root.scrollTop;
  await new Promise(resolve=>setTimeout(resolve,275));const after350=root.scrollTop;
  html.style.scrollBehavior='auto';root.scrollTop=0;root.scrollTop=400;
  const autoImmediately=root.scrollTop;
  html.style.scrollBehavior='';
  return {before,immediately,after75,after350,autoImmediately};
 })()`);
 console.log("UI_AUDIT_ROOT_BEHAVIOR:"+JSON.stringify(smoothAudit));
 if(smoothAudit.before.behavior!=="auto"||smoothAudit.immediately!==400||
    smoothAudit.after75!==400||smoothAudit.after350!==400)
   throw Error("Document scroll delay persists: "+JSON.stringify(smoothAudit));
 const wheel=async(widget,targetSelector,dy,innerPosition=0)=>{
  const geometry=await run(`(()=>{
    const card=document.querySelector('[data-widget="${widget}"]');
    const body=card?.querySelector('.widget-scroll-body');
    const target=card?.querySelector(${JSON.stringify(targetSelector)});
    if(!card||!body||!target)throw Error('Missing wheel target for ${widget}');
    target.scrollIntoView({block:'center',behavior:'instant'});
    const root=document.scrollingElement;
    const maxRoot=root.scrollHeight-root.clientHeight;
    // Target center should be visible and leave enough document remaining to
    // distinguish true root movement from a clamped scroll boundary.
    const absolute=target.getBoundingClientRect().top+root.scrollTop;
    root.scrollTop=Math.max(0,Math.min(maxRoot-260,absolute-innerHeight/2));
    body.scrollTop=${innerPosition};
    const b=target.getBoundingClientRect();
    const x=Math.round(b.left+b.width/2),y=Math.round(b.top+b.height/2);
    const actual=document.elementFromPoint(x,y);
    return {x,y,onViewport:y>30&&y<innerHeight-30,
      hit:!!actual&&body.contains(actual),
      actual:actual?.tagName,actualClass:actual?.getAttribute('class'),
      root:root.scrollTop,rootMax:maxRoot,inner:body.scrollTop,
      bodyMax:body.scrollHeight-body.clientHeight};
   })()`);
  if(!geometry.onViewport||!geometry.hit||geometry.rootMax-geometry.root<dy+50)
    throw Error("Invalid physical wheel target for "+widget+": "+JSON.stringify(geometry));
  await call("Input.dispatchMouseEvent",{type:"mouseWheel",x:geometry.x,y:geometry.y,deltaX:0,deltaY:dy,modifiers:0,pointerType:"mouse"});
  await delay(200);
  const after=await run(`(()=>({root:document.scrollingElement.scrollTop,inner:document.querySelector('[data-widget="${widget}"]>.widget-scroll-body')?.scrollTop}))()`);
  return {widget,targetSelector,dy,before:geometry,after};
 };
 for(const [widget,target,dy,innerPosition] of [
  ["trend","svg",170,0],["providers",".bar-row",180,0],
  ["models",".widget-scroll-body",180,0],["models",".widget-scroll-body",180,100],
  ["cache",".widget-scroll-body",170,0],["sessions",".widget-scroll-body",180,0]
 ]) {
  const result=await wheel(widget,target,dy,innerPosition);
  console.log("UI_AUDIT_WHEEL:"+JSON.stringify(result));
  if(result.after.root<=result.before.root+80)
    throw Error("Page wheel failed over "+widget+" content: "+JSON.stringify(result));
  if(Math.abs((result.after.inner??0)-(result.before.inner??0))>1)
    throw Error("Wheel consumed by "+widget+" inner scrollport: "+JSON.stringify(result));
 }
 await run("document.scrollingElement.scrollTop=0");
 await capture("TOP_AFTER_WHEEL");
 await run(`(()=>{
   const p=document.querySelector('[data-widget="models"]');
   p.scrollIntoView({behavior:'instant',block:'start'});
 })()`);
 await delay(120);
 await capture("MODELS");
 // Fixed viewport and disabled smooth scrolling isolate geometric drop effects.
 await run('document.documentElement.style.scrollBehavior="auto"');
 await run('document.querySelector("#layout-edit").click()');
 const unlocked=await run('document.querySelector("#dashboard-grid").classList.contains("is-arranging")');
 if(!unlocked)throw Error("The layout editor did not unlock");
 const dragStart=await run(`(()=>{
   const target=document.querySelector('[data-widget="providers"] .section-kicker');
   target.scrollIntoView({block:'center',behavior:'instant'});
   const r=target.getBoundingClientRect();
   const ids=['trend','providers','models','cache','guidance','sessions'];
   return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),
     scrollTop:document.scrollingElement.scrollTop,
     rects:Object.fromEntries(ids.map(id=>[id,document.querySelector('[data-widget="'+id+'"]').getBoundingClientRect().toJSON()]))};
 })()`);
 await call("Input.dispatchMouseEvent",{type:"mousePressed",x:dragStart.x,y:dragStart.y,button:"left",buttons:1,clickCount:1});
 await call("Input.dispatchMouseEvent",{type:"mouseMoved",x:dragStart.x+80,y:dragStart.y+128,button:"left",buttons:1});
 await delay(100);
 await capture("DRAGGING");
 const mid=await run(`(()=>({
   scrollTop:document.scrollingElement.scrollTop,
   transform:document.querySelector('[data-widget="providers"]').style.transform,
   targetTransform:document.querySelector('#grid-drop-preview').style.transform,
   layout:document.querySelector('[data-widget="providers"]').style.gridRow
 }))()`);
 await call("Input.dispatchMouseEvent",{type:"mouseReleased",x:dragStart.x+80,y:dragStart.y+128,button:"left",buttons:0,clickCount:1});
 await delay(110);
 await capture("DROPPED");
 const drop=await run(`(()=>{
   const ids=['trend','providers','models','cache','guidance','sessions'];
   return {scrollTop:document.scrollingElement.scrollTop,
     rects:Object.fromEntries(ids.map(id=>[id,document.querySelector('[data-widget="'+id+'"]').getBoundingClientRect().toJSON()]))};
 })()`);
 console.log("UI_AUDIT_DRAG:"+JSON.stringify({dragStart,mid,drop}));
 await run('document.querySelector("#layout-cancel").click()');
 const state=await run(`(()=>({menu:document.querySelector('[data-widget="models"] .viz-menu-trigger')?.getBoundingClientRect().toJSON(),buttonText:document.querySelector('#customize')?.textContent,scrollTop:document.scrollingElement.scrollTop}))()`);
 console.log("UI_AUDIT_STATE:"+JSON.stringify(state));
 console.log("UI_AUDIT_PASS");
}catch(e){console.error("UI_AUDIT_FAILURE",e?.stack??e);process.exitCode=1;}
finally{
 try{socket?.close();}catch{}
 if(browser){try{browser.kill("SIGTERM");}catch{}await Promise.race([new Promise(res=>browser.once("exit",res)),delay(1200)]);}
 try{await new Promise(res=>server?.close(res)??res());}catch{}
 await rm(temp,{recursive:true,force:true,maxRetries:6,retryDelay:150}).catch(()=>{});
}
