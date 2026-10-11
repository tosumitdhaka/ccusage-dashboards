// Native Chrome browser smoke: no Playwright dependency or user ccusage logs.
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {startDashboardServer} from "../server.mjs";

const delay=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const bins=[process.env.CHROME_BIN,"google-chrome","google-chrome-stable","chromium","chromium-browser"].filter(Boolean);
const chrome=bins.find(bin=>spawnSync(bin,["--version"],{stdio:"ignore"}).status===0);
if(!chrome)throw Error("Chrome/Chromium unavailable; browser smoke must fail, not silently skip");
const temp=await mkdtemp(join(tmpdir(),"ccusage-browser-test-"));
let browser,server,socket;
try{
  server=await startDashboardServer({port:0,collect:async()=>({
    daily:[],weekly:[],monthly:[],session:[],totals:{}
  })});
  const address=server.address();
  const site="http://127.0.0.1:"+address.port;
  browser=spawn(chrome,[
    "--headless=new","--disable-gpu","--no-sandbox","--disable-dev-shm-usage",
    "--no-first-run","--no-default-browser-check","--no-proxy-server",
    "--remote-debugging-port=0","--user-data-dir="+temp,"about:blank"
  ],{stdio:["ignore","ignore","pipe"]});
  let debugPort=0;
  for(let i=0;i<100&&!debugPort;i++){
    if(browser.exitCode!==null)throw Error("Chrome exited before opening DevTools");
    try{
      const active=await readFile(join(temp,"DevToolsActivePort"),"utf8");
      debugPort=Number(active.split("\n")[0]);
    }catch{await delay(100);}
  }
  assert.ok(debugPort,"Chrome DevTools did not start");
  const targets=await (await fetch("http://127.0.0.1:"+debugPort+"/json")).json();
  const tab=targets.find(t=>t.type==="page");
  assert.ok(tab?.webSocketDebuggerUrl,"Chrome page target unavailable");
  socket=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    socket.addEventListener("open",resolve,{once:true});
    socket.addEventListener("error",reject,{once:true});
  });
  let nextId=0;
  const pending=new Map();
  socket.addEventListener("message",event=>{
    const msg=JSON.parse(event.data);
    if(!msg.id||!pending.has(msg.id))return;
    const p=pending.get(msg.id);pending.delete(msg.id);
    if(msg.error)p.reject(Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++nextId;
    pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
    const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error("Browser JS exception: "+(r.exceptionDetails.text??JSON.stringify(r.exceptionDetails)));
    return r.result?.value;
  };
  const until=async(fn,label)=>{
    for(let i=0;i<100;i++){
      try{if(await fn())return;}catch{/* Browser still navigating. */}
      await delay(100);
    }
    const diagnostic=await evaluate('JSON.stringify({ready:document.readyState,notice:document.querySelector("#notice")?.textContent,stat:document.querySelector("#stat-tokens")?.textContent,menu:!!document.querySelector(\'.dashboard-grid [data-widget="trend"] .viz-menu-trigger\')})').catch(e=>String(e));
    throw Error("Timed out waiting for "+label+" "+diagnostic);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:850,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:site});
  await until(async()=>await evaluate(
    'document.readyState==="complete" && document.querySelector("#stat-tokens")?.textContent!=="—" && !!document.querySelector(\'.dashboard-grid [data-widget="trend"] .viz-menu-trigger\')'
  ),"dashboard to finish rendering");

  const visibility=await evaluate(`(()=>{
    const card=document.querySelector('[data-widget="trend"]');
    const controls=card.querySelector('.chart-header-controls');
    const menu=card.querySelector('.viz-menu-trigger');
    const readable=e=>({opacity:getComputedStyle(e).opacity,visibility:getComputedStyle(e).visibility,
      pointerEvents:getComputedStyle(e).pointerEvents,width:e.getBoundingClientRect().width});
    return {controls:readable(controls),menu:readable(menu)};
  })()`);
  for(const [kind,item] of Object.entries(visibility)){
    assert.ok(Number(item.opacity)>0.5&&item.pointerEvents!=="none"&&item.visibility==="visible"&&item.width>0,
      kind+" inaccessible: "+JSON.stringify(item));
  }
  assert.equal(await evaluate(`(()=>{
    document.querySelector('[data-widget="trend"] .viz-menu-trigger').click();
    const open=document.querySelector('#viz-popover-trend').matches(':popover-open');
    if(open)document.querySelector('#viz-popover-trend').hidePopover();
    return open;
  })()`),true,"Trend visualization options must open");

  const wheelAt=async widget=>{
    const selector='[data-widget="'+widget+'"]>.widget-scroll-body';
    const geometry=await evaluate(`(()=>{
      const body=document.querySelector(${JSON.stringify(selector)});
      body.scrollIntoView({block:"center",behavior:"instant"});
      const rect=body.getBoundingClientRect();
      const root=document.scrollingElement;
      return {x:Math.round(Math.min(innerWidth-70,Math.max(70,rect.left+rect.width/2))),
        y:Math.round(Math.min(innerHeight-110,Math.max(110,rect.top+Math.min(rect.height/2,220)))),
        before:root.scrollTop,max:root.scrollHeight-root.clientHeight,
        scrollable:body.scrollHeight>body.clientHeight+1};
    })()`);
    assert.ok(geometry.max>geometry.before+120,"Page needs room to scroll when testing "+widget+": "+JSON.stringify(geometry));
    await send("Input.dispatchMouseEvent",{type:"mouseWheel",x:geometry.x,y:geometry.y,
      deltaX:0,deltaY:200,modifiers:0,pointerType:"mouse"});
    await delay(160);
    const after=await evaluate("document.scrollingElement.scrollTop");
    assert.ok(after>geometry.before+20,widget+" body trapped page wheel: "+JSON.stringify({...geometry,after}));
    return {widget,before:geometry.before,after};
  };
  const trendScroll=await wheelAt("trend");
  const providerScroll=await wheelAt("providers");

  await evaluate('document.querySelector("#layout-edit").click()');
  const dragStart=await evaluate(`(()=>{
    const kicker=document.querySelector('[data-widget="providers"] .section-kicker');
    kicker.scrollIntoView({block:"center",behavior:"instant"});
    const r=kicker.getBoundingClientRect();
    return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};
  })()`);
  await send("Input.dispatchMouseEvent",{type:"mousePressed",x:dragStart.x,y:dragStart.y,
    button:"left",buttons:1,clickCount:1});
  await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:dragStart.x+80,y:dragStart.y+128,
    button:"left",buttons:1});
  await delay(90);
  const drag=await evaluate(`(()=>{
    const card=document.querySelector('[data-widget="providers"]');
    const matrix=new DOMMatrixReadOnly(getComputedStyle(card).transform);
    return {transform:card.style.transform,dx:matrix.m41,dy:matrix.m42,
      source:card.classList.contains("layout-drag-source")};
  })()`);
  assert.ok(drag.source,"Provider widget should enter floating drag mode: "+JSON.stringify(drag));
  assert.ok(Math.abs(drag.dx-36)<12&&Math.abs(drag.dy-57.6)<12,
    "Dragged widget must move at 45% gain, not full pointer speed: "+JSON.stringify(drag));
  await send("Input.dispatchMouseEvent",{type:"mouseReleased",x:dragStart.x+80,y:dragStart.y+128,
    button:"left",buttons:0,clickCount:1});
  await evaluate('document.querySelector("#layout-cancel").click()');
  console.log("CHROME_INTERACTION_SMOKE_PASS",JSON.stringify({visibility,trendScroll,providerScroll,drag}));
}catch(error){
  console.error("CHROME_SMOKE_ROOT_CAUSE:",error?.stack??String(error));
  throw error;
}finally{
  try{socket?.close();}catch{}
  if(browser){
    try{browser.kill("SIGTERM");}catch{}
    await Promise.race([new Promise(resolve=>browser.once("exit",resolve)),delay(2000)]);
  }
  try{await new Promise(resolve=>server?.close(resolve)??resolve());}catch{}
  // Chrome writes profile files asynchronously on exit; cleanup must not
  // mask the actual interaction failure.
  await rm(temp,{recursive:true,force:true,maxRetries:8,retryDelay:150}).catch(err=>
    console.warn("Temporary Chrome profile cleanup:",err.message));
}
