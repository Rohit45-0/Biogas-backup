import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {createServer} from "node:net";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {randomUUID,createHmac,createHash} from "node:crypto";

test("November remediation: durable logout, least privilege, model artifacts and failed evidence",{timeout:180000},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"aqua-security-")),password=randomUUID(),secret=randomUUID();let server,base,logs="";
 async function start(){
  const listener=createServer();listener.listen(0,"127.0.0.1");await once(listener,"listening");const port=listener.address().port;await new Promise(r=>listener.close(r));base="http://127.0.0.1:"+port;
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{windowsHide:true,env:{...process.env,VERCEL:"",BLOB_READ_WRITE_TOKEN:"",AQUA_AUDIT_DIR:directory,AQUA_SECURITY_DIR:directory,AQUA_SESSION_SECRET:secret,AQUA_AUDIT_SIGNING_KEY:"",AQUA_AUDIT_PREVIOUS_KEYS:"",AQUA_ADMIN_USERNAME:"admin",AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:"user",AQUA_USER_PASSWORD:password}});
  server.stdout.on("data",d=>logs+=d);server.stderr.on("data",d=>logs+=d);
  for(let i=0;i<150;i++){try{if((await fetch(base+"/api/auth/session")).status===401)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error(logs);
 }
 async function stop(){if(server&&!server.killed){const done=once(server,"exit");server.kill();await done;}}
 async function raw(url,body,cookie=""){return fetch(base+url,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});}
 async function call(url,body,cookie){const r=await raw(url,body,cookie);return {status:r.status,data:await r.json()};}
 async function login(username="admin",pw=password){const r=await raw("/api/auth/login",{username,password:pw});assert.equal(r.status,200,await r.clone().text());return r.headers.get("set-cookie").split(";")[0];}
 await start();t.after(stop);let admin=await login(),reviewer,runId;
 await t.test("browser same-origin login works and cross-origin credential writes fail",async()=>{
  const good=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json",Origin:base},body:JSON.stringify({username:"admin",password})});assert.equal(good.status,200);
  const bad=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://untrusted.example"},body:JSON.stringify({username:"admin",password})});assert.equal(bad.status,403);
  for(const url of ["/api/auth/logout","/api/auth/accounts","/api/auth/password"]){const r=await fetch(base+url,{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://untrusted.example",Cookie:admin},body:"{}"});assert.equal(r.status,403,url);}
 });
 await t.test("copied cookie fails immediately after logout and after process restart",async()=>{
  const copied=await login();assert.equal((await call("/api/audit?limit=1",undefined,copied)).status,200);
  assert.equal((await call("/api/auth/logout",{},copied)).data.serverRevoked,true);
  for(const url of ["/api/auth/session","/api/audit","/api/ml/predict","/api/ml/artifacts"])assert.equal((await call(url,undefined,copied)).status,401,url);
  await stop();await start();assert.equal((await call("/api/audit",undefined,copied)).status,401);
  assert.equal((await call("/api/audit",undefined,admin)).status,200,"A different active session remains valid across restart");
 });
 await t.test("signed legacy stateless cookies are rejected",async()=>{
  const payload=Buffer.from(JSON.stringify({username:"admin",role:"admin",expiresAt:Date.now()+3600000})).toString("base64url");
  const cookie="aqua_session="+payload+"."+createHmac("sha256",secret).update(payload).digest("base64url");
  assert.equal((await call("/api/audit",undefined,cookie)).status,401);
 });
 await t.test("named reviewer can test models and inspect evidence, but not administer",async()=>{
  const created=await call("/api/auth/accounts",{action:"create",username:"auditor.test",displayName:"Test auditor",role:"reviewer",password,currentPassword:password},admin);assert.equal(created.status,201,JSON.stringify(created.data));
  reviewer=await login("auditor.test");
  for(const url of ["/api/audit","/api/ml/predict","/api/audit/tests","/api/ml/artifacts"])assert.equal((await call(url,undefined,reviewer)).status,200,url);
  for(const url of ["/api/auth/accounts","/api/settings"])assert.equal((await call(url,undefined,reviewer)).status,403,url);
  for(const url of ["/api/auth/accounts","/api/settings","/api/validation"])assert.equal((await call(url,{},reviewer)).status,403,url);
  assert.equal((await call("/api/early-warning",{action:"review"},reviewer)).status,403);
  const inputs={feedstock:"Dairy WW",feedRate:846,temperature:36.5,ph:7.2,olr:3.2,hrt:22,codIn:7600,vfa:1100,mixing:50};
  const run=await call("/api/ml/predict",{operatingConditions:inputs},reviewer);assert.equal(run.status,200);assert.equal(run.data.audit.saved,true);runId=run.data.runId;
  assert.equal((await call("/api/audit?runId="+runId,undefined,reviewer)).data.record.username,"auditor.test");
  assert.equal((await call("/api/ml/verify",{runId},reviewer)).data.status,"PASS");
 });
 await t.test("downloaded artifact bytes match the running registry",async()=>{
  const registry=(await call("/api/ml/predict",undefined,reviewer)).data.manifest;
  for(const id of ["ridge","gradient_boosting"]){
   const r=await raw("/api/ml/artifacts?file="+id,undefined,reviewer);assert.equal(r.status,200);
   const digest="sha256:"+createHash("sha256").update(Buffer.from(await r.arrayBuffer())).digest("hex");assert.equal(digest,registry.models[id].artifactHash);assert.equal(r.headers.get("X-Artifact-SHA256"),digest);
  }
  assert.equal((await call("/api/ml/artifacts?file=../../.env",undefined,reviewer)).status,404);
  assert.equal((await call("/api/ml/artifacts?file=ridge")).status,401);
 });
 await t.test("failed HMAC records are preserved and clearly unverified in every export",async()=>{
  const file=path.join(directory,"audit-v2/records",runId+".json"),original=JSON.parse(await readFile(file,"utf8"));original.signature="0".repeat(64);const failed=JSON.stringify(original);await writeFile(file,failed);
  const d=await call("/api/audit?runId="+runId,undefined,reviewer);
  assert.equal(d.data.integrity,false);assert.equal(d.data.authentication.type,"UNVERIFIED_HISTORICAL_RECORD");assert.equal(d.data.diagnostics.checks.recordDigest,true);assert.equal(d.data.diagnostics.checks.hmac,false);
  for(const format of ["json","csv"]){const r=await raw("/api/audit?runId="+runId+"&format="+format,undefined,reviewer);assert.equal(r.status,200);assert.equal(r.headers.get("X-Aquaivolt-Integrity"),"FAIL");assert.match(r.headers.get("content-disposition"),/UNVERIFIED-INTEGRITY-FAILED/);const body=await r.text();assert.match(body,/UNVERIFIED_HISTORICAL_RECORD/);assert.doesNotMatch(body,/"type":\\s*"SERVER_AUTHENTICATED"/);}
  assert.equal(await readFile(file,"utf8"),failed);assert.equal((await call("/api/ml/verify",{runId},reviewer)).status,409);assert.equal((await call("/api/ml/predict?runId="+runId+"&format=csv",undefined,reviewer)).status,409);
 });
 await t.test("auditor review preserves exceptions and persists separately scoped software checks",async()=>{
  assert.equal((await call("/api/audit/review")).status,401);
  const user=await login("user");assert.equal((await call("/api/audit/review",undefined,user)).status,403);
  assert.equal((await call("/api/audit/review",{action:"run_checks"},user)).status,403);
  const setup=await call("/api/audit/review",undefined,reviewer);assert.equal(setup.status,200);assert.equal(setup.data.historical.length,8);
  assert.ok(setup.data.reviewers.some(a=>a.username==="auditor.test"));assert.doesNotMatch(JSON.stringify(setup.data),/passwordHash|credentialVersion/);
  const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v&&typeof v==="object"?`{${Object.entries(v).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`:JSON.stringify(v);
  const hash=v=>"sha256:"+createHash("sha256").update(canonical(v)).digest("hex");
  const {recordHash,signature,...template}=JSON.parse(await readFile(path.join(directory,"audit-v2/records",runId+".json"),"utf8"));
  const originals=[];
  for(const row of setup.data.historical){const content={...template,id:row.id};const text=JSON.stringify({...content,recordHash:hash(content),signature:"0".repeat(64)});const file=path.join(directory,"audit-v2/records",row.id+".json");await writeFile(file,text);originals.push({file,text});}
  const r=await call("/api/audit/review",{action:"run_checks"},reviewer);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.saved,true);assert.equal(r.data.status,"PASS");assert.equal(r.data.checks.length,6);assert.equal(r.data.historicalAuthentication,"UNRESOLVED");assert.equal(r.data.plantValidation,"PENDING_COMMISSIONING_AND_INDEPENDENT_DATA");assert.match(r.data.securityLogoutTest,/Separate/);
  assert.equal(r.data.runIds.length,3);assert.ok((await call("/api/audit?runId="+r.data.reportId,undefined,reviewer)).data.integrity);
  for(const {file,text} of originals)assert.equal(await readFile(file,"utf8"),text);
  for(const id of ["bundle","protocol","checklist","investigation","methodology"]){const download=await raw("/api/ml/artifacts?file="+id,undefined,reviewer);assert.equal(download.status,200,id);const bytes=Buffer.from(await download.arrayBuffer());assert.equal(download.headers.get("X-Artifact-SHA256"),"sha256:"+createHash("sha256").update(bytes).digest("hex"));if(id==="bundle")assert.equal(bytes.subarray(0,2).toString(),"PK");}
  assert.equal((await call("/api/audit/review",{action:"unknown"},reviewer)).status,422);
 });
 await t.test("admin revokes all reviewer sessions; disable also invalidates fresh sessions",async()=>{
  const second=await login("auditor.test");
  assert.equal((await call("/api/auth/accounts",{action:"revoke_sessions",username:"auditor.test",currentPassword:password},admin)).status,200);
  for(const cookie of [reviewer,second])assert.equal((await call("/api/audit",undefined,cookie)).status,401);
  reviewer=await login("auditor.test");
  assert.equal((await call("/api/auth/accounts",{action:"disable",username:"auditor.test",currentPassword:password},admin)).status,200);
  assert.equal((await call("/api/audit",undefined,reviewer)).status,401);
  assert.equal((await call("/api/auth/login",{username:"auditor.test",password})).status,401);
 });
 await t.test("password change invalidates every copied session and preserves other accounts",async()=>{
  const another=await login(),newPassword=randomUUID(),user=await login("user");
  assert.equal((await call("/api/auth/password",{currentPassword:"wrong",newPassword},admin)).status,422);
  const changed=await call("/api/auth/password",{currentPassword:password,newPassword},admin);assert.equal(changed.status,200);assert.equal(changed.data.allAccountSessionsInvalidated,true);
  for(const cookie of [admin,another])assert.equal((await call("/api/audit",undefined,cookie)).status,401);
  assert.equal((await call("/api/auth/session",undefined,user)).status,200);
  assert.equal((await call("/api/auth/login",{username:"admin",password})).status,401);
  admin=await login("admin",newPassword);
 });
 await t.test("trend candidate comparison retains misses, first fixed alarms and provenance",async()=>{
  const comparison=await call("/api/early-warning",{action:"compare_policies"},admin);assert.equal(comparison.status,200);
  const r=comparison.data.result;assert.equal(r.events.length,6);assert.equal(r.candidate.total,6);assert.match(r.acceptance,/not a fresh independent holdout/);
  for(const e of r.events){const lead=e.candidate.leadHoursVersusFirstFixed;assert.equal(e.candidate.earlierThanFixed,lead!==null&&lead>0);}
  const assessed=await call("/api/early-warning",{action:"evaluate_trend",input:{index:145,mode:"workbook"}},admin);assert.equal(assessed.status,200);
  const record=(await call("/api/audit?runId="+assessed.data.runId,undefined,admin)).data.record;assert.doesNotMatch(JSON.stringify(record.inputs),/Future_Onset|Hidden_True|Injected_Scenario|At_Onset/);
  assert.equal(record.modelVersion,"causal-trend-advisory-2026-11-13-v1");
 });
});
