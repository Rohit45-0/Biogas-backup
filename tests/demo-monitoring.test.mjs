import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {createServer} from "node:net";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
test("demo monitoring persistence, alarm lifecycle and production holds",{timeout:120000},async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),"aqua-monitor-test-")),password=randomUUID();
 const listener=createServer();listener.listen(0,"127.0.0.1");await once(listener,"listening");const port=listener.address().port;await new Promise(r=>listener.close(r));const base=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd:process.cwd(),windowsHide:true,env:{...process.env,VERCEL:"",BLOB_READ_WRITE_TOKEN:"",AQUA_AUDIT_DIR:dir,AQUA_SESSION_SECRET:randomUUID(),AQUA_ADMIN_USERNAME:"admin",AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:"user",AQUA_USER_PASSWORD:password}});
 let logs="",cookie="",snapshot;server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch(base+"/api/auth/session")).status===401)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 async function login(username="admin"){const response=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});assert.equal(response.status,200,logs);return response.headers.get("set-cookie").split(";")[0];}
 async function call(url,body,auth=cookie,extra={}){const r=await fetch(base+url,{method:body===undefined?"GET":"POST",headers:{Cookie:auth,"Content-Type":"application/json",...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 async function command(c){const r=await call("/api/monitoring",{parentId:snapshot?.id,command:c});assert.equal(r.status,200,JSON.stringify(r.data));snapshot=r.data.snapshot;assert.equal(r.data.audit.saved,true);return r.data;}
 cookie=await login();
 await t.test("authentication and admin-only mutation",async()=>{assert.equal((await call("/api/monitoring",undefined,"")).status,401);const user=await login("user");assert.equal((await call("/api/monitoring",{command:{action:"start"}},user)).status,403);});
 await t.test("400 source readings, original source archive and distinct crossing counts",async()=>{const r=await call("/api/monitoring");assert.equal(r.data.readings.length,400);assert.equal(r.data.source.sourceTotalRows,480);assert.equal(new Set(r.data.readings.map(row=>row.t)).size,400);assert.equal(r.data.counts.find(c=>c.id==="h2sHigh").critical,13);const old=await call("/api/monitoring?sourceVersion=demo-monitoring-1.0.0");assert.equal(old.data.readings.length,58);assert.equal(old.data.counts.find(c=>c.id==="h2sHigh").critical,0);const csv=await fetch(base+"/api/monitoring?format=source_csv",{headers:{Cookie:cookie}});assert.equal((await csv.text()).split("\r\n").length,401);});
 await t.test("first-row sensor and engineering baseline remain distinct",async()=>{const r=await command({action:"start"});assert.equal(snapshot.reading.gas,2.767);assert.ok(Number.isFinite(r.baseline.biogasNm3Day));assert.ok(Math.abs(r.baseline.hrtHours-90/.4293)<1e-8);});
 await t.test("warning -> critical -> acknowledge -> recovery with history",async()=>{await command({action:"fixture",fixture:"warning"});assert.equal(snapshot.alarms.find(a=>a.ruleId==="h2sHigh"&&!a.resolvedAt).severity,"warning");const critical=await command({action:"fixture",fixture:"h2s-critical"});assert.equal(critical.assessment.hold,true);const alarm=snapshot.alarms.find(a=>a.ruleId==="h2sHigh"&&!a.resolvedAt);const ack=await command({action:"acknowledge",alarmId:alarm.id});assert.equal(ack.assessment.hold,true);assert.equal(snapshot.alarms.find(a=>a.id===alarm.id).acknowledgedBy,"admin");const normal=await command({action:"fixture",fixture:"normal"});assert.equal(normal.assessment.hold,false);assert.ok(snapshot.alarms.find(a=>a.id===alarm.id).resolvedAt);});
 await t.test("all thirteen inclusive warning and critical thresholds",async()=>{const r=await call("/api/monitoring",{verifyId:snapshot.id});assert.equal(r.status,200);assert.equal(r.data.passed,true);assert.equal(r.data.checks.length,9);});
 await t.test("critical, missing and stale inputs still reject explicitly monitored runs",async()=>{for(const fixture of ["h2s-critical","oxygen-critical","pressure-critical","methane-critical","power-critical","missing","stale"]){const r=await command({action:"fixture",fixture});assert.equal(r.assessment.hold,true,fixture);for(const route of ["hrt","reactor-search"]){const held=await call(`/api/monitoring/production?model=${route}`,{},cookie,{"x-aqua-demo-snapshot":snapshot.id});assert.equal(held.status,409,fixture+route);}}});
 await t.test("independent planning models work while monitoring is critical, missing or stale",async()=>{
  const reactor=(await call("/api/research/reactor-search")).data.defaults;
  reactor.method="model";
  const production={baseline:{value:360,unit:"hours"},objective:"same_tank_gain",sameTankStage:"R5",retainedMethanePct:90,targetHours:12};
  for(const fixture of ["h2s-critical","missing","stale"]){
   await command({action:"fixture",fixture});const original=structuredClone(snapshot);
   for(const [endpoint,input] of [["hrt",production],["reactor-search",reactor]]){
    const run=await call(`/api/research/${endpoint}`,input);assert.equal(run.status,200,JSON.stringify(run.data));assert.equal(run.data.audit.saved,true);assert.equal(run.data.demoMonitoring,undefined);assert.ok(run.data.runId);
    const evidence=await call(`/api/audit?runId=${run.data.runId}`);assert.equal(evidence.data.integrity,true);
   }
   assert.deepEqual((await call(`/api/monitoring?runId=${original.id}`)).data.snapshot,original,"Planning must not clear or mutate an alarm");
  }
  assert.equal((await call("/api/research/hrt",{...production,baseline:{value:null,unit:"hours"}})).status,422);
 });
 await t.test("null/invalid thresholds are rejected without changing saved snapshot",async()=>{const original=snapshot.id;const rules=structuredClone(snapshot.rules);rules[0].warning=null;assert.equal((await call("/api/monitoring",{parentId:original,command:{action:"thresholds",rules}})).status,422);assert.equal((await call(`/api/monitoring?runId=${original}`)).data.snapshot.id,original);rules[0].warning=2;rules[0].critical=3;assert.equal((await call("/api/monitoring",{parentId:original,command:{action:"thresholds",rules}})).status,422);});
 await t.test("threshold change re-evaluates current sample",async()=>{await command({action:"fixture",fixture:"normal"});const rules=structuredClone(snapshot.rules);rules.find(r=>r.id==="h2sHigh").warning=50;rules.find(r=>r.id==="h2sHigh").critical=60;const r=await command({action:"thresholds",rules});assert.equal(r.assessment.hold,true);assert.equal(r.snapshot.rules.find(r=>r.id==="h2sHigh").critical,60);});
 await t.test("record survives logout/login and remains in paginated index",async()=>{const id=snapshot.id;await call("/api/auth/logout",{});cookie=await login();assert.equal((await call(`/api/monitoring?runId=${id}`)).data.snapshot.id,id);const list=await call("/api/monitoring?view=history");assert.ok(list.data.items.some(i=>i.id===id));});
 await t.test("server-authenticated JSON, alarm CSV and source CSV export",async()=>{const json=await call(`/api/monitoring?runId=${snapshot.id}&format=json`);assert.equal(json.data.authentication.independentlyVerifiable,false);assert.ok(json.data.record.recordHash.startsWith("sha256:"));for(const format of ["alarms_csv","readings_csv"]){const r=await fetch(`${base}/api/monitoring?runId=${snapshot.id}&format=${format}`,{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.ok((await r.text()).includes(snapshot.id));}});
 await t.test("model execution links context while preserving model inputs",async()=>{await command({action:"start"});await command({action:"fixture",fixture:"normal"});const r=await call("/api/monitoring/production?model=hrt",{baseline:{value:360,unit:"hours"},objective:"same_tank_gain",sameTankStage:"R5",retainedMethanePct:90,targetHours:12},cookie,{"x-aqua-demo-snapshot":snapshot.id});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.demoMonitoring.saved,true);assert.equal(r.data.demoMonitoring.snapshotId,snapshot.id);const evidence=await call(`/api/audit?runId=${r.data.demoMonitoring.linkId}`);assert.equal(evidence.status,200);const reports=await call("/api/research/history");assert.ok(reports.data.items.some(i=>i.id===r.data.runId));});
 await t.test("invalid parent and malformed commands fail explicitly",async()=>{assert.equal((await call("/api/monitoring",{parentId:randomUUID(),command:{action:"step"}})).status,404);assert.equal((await call("/api/monitoring",null)).status,400);assert.equal((await call("/api/monitoring",{parentId:snapshot.id,command:{action:"sample",index:400}})).status,422);});
});
