import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.BASE_URL??'http://127.0.0.1:3118',out=process.env.QA_DIR??'test-results/same-tank-workflow/local';
assert.ok(process.env.AQUA_CHECK_PASSWORD,'AQUA_CHECK_PASSWORD required');
const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.AQUA_CHECK_PASSWORD})});assert.equal(login.status,200);
const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
async function call(path,body){const r=await fetch(base+path,{headers:{cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});assert.equal(r.status,200,`${path}: ${r.status} ${r.status!==200?await r.text():''}`);return r;}
const parse=text=>{const [head,...rows]=text.split('\r\n').filter(Boolean).map(line=>[...line.matchAll(/"((?:[^"]|"")*)"(?=,|$)/g)].map(m=>m[1].replaceAll('""','"')));return rows.map(row=>Object.fromEntries(row.map((v,i)=>[head[i],v])));};
await fs.mkdir(out,{recursive:true});
const metadata=await(await call('/api/research/hrt')).json();assert.equal(metadata.sameTank.fitRows,500);
const source=await(await call('/api/research/hrt?view=same-tank-data')).json();assert.equal(source.rows.length,500);
const report={base,checkedAt:new Date().toISOString(),runs:[],sourceRows:source.rows.length};
let previous;
for(const stage of ['R5','R5','R6']){
 const request={baseline:{value:360,unit:'hours'},objective:'same_tank_gain',sameTankStage:stage,retainedMethanePct:90,targetHours:12,...(previous?{previousCandidateId:previous.pairedComparison.input.id}:{})};
 const run=await(await call('/api/research/hrt',request)).json();
 assert.equal(run.audit.saved,true,'Persistent audit storage');assert.equal(run.candidateCount,2000);assert.equal(run.pairedComparison.trainingRows,500);assert.equal(run.pairedComparison.sameTank.stage,stage);
 const original=source.rows[run.pairedComparison.input.parentA-1];
 for(const [key,column] of [['hrtHours','BEFORE HRT (h)'],['biogasM3Day','BEFORE Biogas (m3/d)'],['methaneM3Day','BEFORE Methane (m3/d)'],['electricityKwhDay','BEFORE Electricity (kWh/d)']])assert.equal(run.comparison[key],original[column]);
 assert.ok(run.selected.hrtHours<run.comparison.hrtHours);if(stage==='R6')assert.ok(run.selected.hrtHours>=72.3);
 if(previous){assert.notEqual(run.pairedComparison.input.id,previous.pairedComparison.input.id);assert.deepEqual(run.comparison,previous.comparison);}
 for(const key of ['biogasM3Day','methaneM3Day','electricityKwhDay'])assert.ok(Math.abs(run.pairedComparison.gains[key]-(run.selected[key]/run.comparison[key]-1)*100)<1e-9);
 const verification=await(await call('/api/research/hrt/verify',{runId:run.runId})).json();assert.equal(verification.status,'PASS',JSON.stringify(verification));
 const saved=await(await call(`/api/research/hrt?runId=${run.runId}`)).json();assert.equal(saved.outputHash,run.outputHash);assert.deepEqual(saved.selected,run.selected);
 const csv=await(await call(`/api/research/hrt?runId=${run.runId}&format=csv`)).text(),rows=parse(csv);assert.equal(rows.length,2000);
 const selected=rows.find(row=>row.selected_scenario==='true');assert.equal(Number(selected.before_hrt_hours),run.comparison.hrtHours);assert.equal(Number(selected.after_hrt_hours),run.selected.hrtHours);assert.equal(Number(selected.predicted_electricity_kwh_day),run.selected.electricityKwhDay);assert.equal(Number(selected.training_rows),500);assert.equal(selected.stage_eligible,'true');assert.equal(Number(selected.source_parent_a_excel_row),run.pairedComparison.sameTank.baselineSourceRow);
 assert.ok(Buffer.byteLength(JSON.stringify(run))<4_000_000);
 await fs.writeFile(`${out}/${run.runId}.json`,JSON.stringify(run));await fs.writeFile(`${out}/${run.runId}.csv`,csv);
 report.runs.push({runId:run.runId,stage,candidate:run.pairedComparison.input.id,before:run.comparison,after:run.selected,gains:run.pairedComparison.gains,qualifying:run.pairedComparison.qualifyingCount,verification,responseBytes:Buffer.byteLength(JSON.stringify(run))});
 previous=run;
}
await fs.writeFile(`${out}/api-verification.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({base,sourceRows:report.sourceRows,runs:report.runs.map(r=>({runId:r.runId,stage:r.stage,beforeHrt:r.before.hrtHours,afterHrt:r.after.hrtHours,gains:r.gains,verification:r.verification.status,responseBytes:r.responseBytes}))},null,2));
