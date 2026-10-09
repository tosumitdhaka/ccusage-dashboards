import test from "node:test";
import assert from "node:assert/strict";
import { collectUsage, locateCli, reportArgs } from "./ccusage-adapter.mjs";

test("explicit unified report uses sections, agent breakdown, and JSON", () => {
  assert.deepEqual(reportArgs({offline: false}), ["daily","--sections","daily,weekly,monthly,session","--by-agent","--json"]);
  assert.equal(reportArgs({offline: true}).at(-1),"--offline");
});

test("CLI resolves an official npm launcher without global installation", () => {
  const call=locateCli({
    env: {}, node: "node-test",
    resolvePackage: (id)=>{ assert.equal(id,"ccusage/package.json"); return "/opt/dashboard/node_modules/ccusage/package.json"; },
    args: ["daily","--json"]
  });
  assert.equal(call.command,"node-test");
  assert.match(call.args[0],/ccusage[/\\]src[/\\]cli\.js$/);
  assert.deepEqual(call.args.slice(1),["daily","--json"]);
  assert.throws(()=>locateCli({env:{},resolvePackage:()=>{throw Error("missing");}}),/npm install/);
});

test("optional custom native executable keeps no-shell execution", async () => {
  let captured;
  const output=await collectUsage({
    env:{CCUSAGE_BIN:"/opt/ccusage",LOG_LEVEL:"1"},
    args:["daily","--json"],
    exec:(command,args,opts,callback)=>{
      captured={command,args,opts};
      callback(null,JSON.stringify({daily:[],totals:{}}),"");
    }
  });
  assert.deepEqual(output,{daily:[],totals:{}});
  assert.equal(captured.opts.shell,false);
  assert.equal(captured.args[0],"daily");
  assert.equal(captured.opts.env.LOG_LEVEL,"0");
});

test("fails closed on malformed unified JSON", async () => {
  await assert.rejects(()=>collectUsage({
    env:{CCUSAGE_BIN:"/opt/ccusage"},
    exec:(_c,_a,_o,callback)=>callback(null,'{"daily": {}}',"")
  }),/unexpected JSON/);
});
