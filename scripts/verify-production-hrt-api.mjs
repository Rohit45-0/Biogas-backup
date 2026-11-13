import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const base=process.env.BASE_URL??'http://127.0.0.1:3115';
const folder=process.env.QA_DIR??'test-results/production-hrt-chart';
const values=JSON.parse(await fs.readFile(process.env.QA_VALUES??path.join(folder,'local-ui-values.json'),'utf8'));
assert.equal(values.length,3);
const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.AQUA_CHECK_PASSWORD})});
assert.equal(login.status,200,'Authentication failed');
const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const headers={cookie,'content-type':'application/json'};
const report={base,checkedAt:new Date().toISOString(),runs:[],graphs:[]};
const records=new Map();
for(const ui of values){
 let record=records.get(ui.runId);
 if(!record){
  const response=await fetch(`${base}/api/research/hrt?runId=${encodeURIComponent(ui.runId)}`,{headers});
  assert.equal(response.status,200);record=await response.json();assert.equal(record.integrity,true);
  assert.equal(record.candidates.length,2000);assert.equal(record.audit.saved,true);
  records.set(ui.runId,record);
  const verify=await fetch(`${base}/api/research/hrt/verify`,{method:'POST',headers,body:JSON.stringify({runId:ui.runId})});
  const replay=await verify.json();assert.equal(verify.status,200);assert.equal(replay.status,'PASS');
  report.runs.push({runId:ui.runId,candidates:2000,integrity:true,replay:replay.status,modelVersion:record.modelVersion,engineHash:record.engineHash});
 }
 assert.equal(Number(ui.count),2000);
 assert.equal(Number(ui.selected),record.selected[ui.metric]);
 assert.equal(Number(ui.baseline),record.comparison[ui.metric]);
 assert.equal(Number(ui.selectedHrt),record.selected.hrtHours);
 assert.equal(Number(ui.baselineHrt),record.comparison.hrtHours);
 const gain=(Number(ui.selected)-Number(ui.baseline))/Number(ui.baseline)*100;
 assert.ok(Math.abs(gain-record.pairedComparison.gains[ui.metric])<1e-8);
 report.graphs.push({...ui,gainPct:gain,matchedSavedEvidence:true});
}
await fs.mkdir(folder,{recursive:true});
await fs.writeFile(path.join(folder,'api-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
