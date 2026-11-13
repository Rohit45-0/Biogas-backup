import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const base=process.env.BASE_URL??'http://127.0.0.1:3117',dir=process.env.QA_DIR??'test-results/reactor-source-before';
const values=JSON.parse(await fs.readFile(process.env.QA_VALUES??`${dir}/local-ui-values.json`,'utf8'));
assert.ok(process.env.AQUA_CHECK_PASSWORD,'AQUA_CHECK_PASSWORD is required');
const login=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.AQUA_CHECK_PASSWORD})});
assert.equal(login.status,200,'Sign-in failed');
const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
async function get(path){const response=await fetch(`${base}${path}`,{headers:{cookie}});assert.equal(response.status,200,`${path}: ${response.status}`);return response;}
const parseLine=line=>[...line.matchAll(/"((?:[^"]|"")*)"(?=,|$)/g)].map(m=>m[1].replaceAll('""','"'));
const parseCsv=text=>{const [header,...lines]=text.split('\r\n').map(parseLine);return lines.map(line=>Object.fromEntries(line.map((value,index)=>[header[index],value])));};
const report={base,checkedAt:new Date().toISOString(),runs:[],graphs:[]};
await fs.mkdir(dir,{recursive:true});
for(const id of new Set(values.map(value=>value.runId))){
 const endpoint=`/api/research/reactor-search?runId=${id}`,run=await(await get(endpoint)).json();
 assert.equal(run.request.mode,'source_baseline');assert.equal(run.baseline.hrtHours,360);assert.equal(run.baseline.sourceReference.beforeHrtColumn,'BEFORE HRT (h)');assert.equal(run.baseline.sourceReference.hrtUnit,'hours');assert.ok(run.selected.hrtHours<run.baseline.hrtHours);
 const verification=await(await get(`${endpoint}&verify=true`)).json();assert.equal(verification.status,'PASS');assert.ok(verification.checks.every(check=>check.passed));
 const kpiText=await(await get(`${endpoint}&format=kpi_csv`)).text(),kpis=parseCsv(kpiText),hrt=kpis.find(row=>row.metric==='HRT');
 assert.equal(Number(hrt.before),run.baseline.hrtHours);assert.equal(Number(hrt.after),run.selected.hrtHours);assert.equal(hrt.hrt_unit,'hours');
 const csvText=await(await get(`${endpoint}&format=csv`)).text(),rows=parseCsv(csvText),selected=rows.find(row=>row.selected==='true');assert.equal(rows.length,run.candidateCount);assert.equal(Number(selected.before_hrt_h),run.baseline.hrtHours);assert.equal(Number(selected.after_hrt_h),run.selected.hrtHours);assert.equal(Number(selected.after_electricity_kwh_day),run.selected.outputs.electricityKwhDay);
 for(const ui of values.filter(value=>value.runId===id)){
  assert.equal(Number(ui.baselineHrt),run.baseline.hrtHours);assert.equal(Number(ui.selectedHrt),run.selected.hrtHours);assert.equal(Number(ui.baseline),run.baseline[ui.metric]);assert.equal(Number(ui.selected),run.selected.outputs[ui.metric]);assert.ok(Number(ui.domainMax)>run.baseline.hrtHours);
  report.graphs.push({...ui,matchedSavedEvidence:true});
 }
 await fs.writeFile(`${dir}/${id}-kpis.csv`,kpiText);await fs.writeFile(`${dir}/${id}-scenarios.csv`,csvText);
 if(run.request.method==='source')await fs.writeFile(`${dir}/verified-source-run.json`,JSON.stringify(run));
 report.runs.push({runId:id,method:run.request.method,technology:run.selected.pathway,candidateCount:run.candidateCount,generatedCount:run.generatedCandidateCount,beforeHrt:run.baseline.hrtHours,afterHrt:run.selected.hrtHours,hrtDecreasePct:run.selected.hrtReductionPct,selected:run.selected.id,sourceReference:run.baseline.sourceReference,verification});
}
await fs.writeFile(`${dir}/api-verification.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({base,runs:report.runs,verifiedGraphs:report.graphs.length},null,2));
