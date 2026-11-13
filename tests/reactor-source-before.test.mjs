import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const core=require('../app/lib/reactor-search.ts'),source=require('../app/lib/reactor-source-reference.ts'),chart=require('../app/lib/reactor-chart.ts'),exports=require('../app/lib/reactor-search-execution.ts');
const archive=require('../ai-workflow/research/reactor-study-2026-11-09/source-archive.json');
const meta=core.reactorSearchMetadata(),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const results=meta.technologies.map(t=>core.calculateReactorSearch({...structuredClone(meta.defaults),technology:t.id}));
const fields=['biogasM3Day','methaneM3Day','electricityKwhDay'];

test('default reactor study uses the original source BEFORE reference and exact source AFTER values',()=>{
 assert.equal(meta.defaults.mode,'source_baseline');assert.equal(meta.defaults.method,'source');assert.deepEqual(meta.defaults.baseline,{origin:'workbook'});
 for(const r of results){assert.equal(r.baseline.hrtHours,360);assert.equal(r.generatedCandidateCount,0);assert.equal(r.candidateCount,400);assert.ok(r.baseline.sourceReference);assert.equal(r.baseline.sourceReference.hrtUnit,'hours');assert.ok(r.selected);assert.equal(r.selected.pathway,r.request.technology);assert.equal(r.selected.hrtHours,Math.min(...r.candidates.filter(c=>c.eligible).map(c=>c.hrtHours)));assert.ok(r.selected.hrtReductionPct>50);}
});

test('all 400 source comparisons match every original BEFORE / AFTER column, including rounded workbook outputs',()=>{
 let count=0;
 for(const [index,file] of archive.entries())for(const raw of file.sheets['200 Scenarios'].slice(1)){
  const id=`T2-${index===0?'A':'B'}-${String(raw[0]).padStart(4,'0')}`,row=source.reactorSourceRecord(id),run=results.find(r=>r.request.technology===raw[1]),candidate=run.candidates.find(c=>c.id===id);
  assert.deepEqual(row.before,{hrtHours:raw[4],biogasM3Day:raw[5],methaneM3Day:raw[7],electricityKwhDay:raw[8]});
  assert.equal(candidate.hrtHours,raw[10]);assert.equal(candidate.outputs.biogasM3Day,raw[18]);assert.equal(candidate.outputs.methaneM3Day,raw[19]);assert.equal(candidate.outputs.electricityKwhDay,raw[20]);assert.equal(candidate.outputs.annualElectricityKwh,raw[21]);
  assert.equal(row.provenance.file,file.file);assert.equal(row.provenance.sha256,file.sha256);assert.equal(row.provenance.row,raw[0]+1);
  for(const metric of fields){assert.equal(run.baseline[metric],row.before[metric]);close(candidate.gains[metric],(row.after[metric]-row.before[metric])/row.before[metric]*100);}
  close(candidate.hrtReductionPct,(raw[4]-raw[10])/raw[4]*100);count++;
 }
 assert.equal(count,400);
 const example=results[0].candidates.find(c=>c.id==='T2-B-0169');assert.equal(example.hrtHours,7.6);assert.equal(example.outputs.methaneM3Day,61.16);assert.equal(example.outputs.electricityKwhDay,219.53);close(example.hrtReductionPct,97.88888888888889);
});

test('all three graph axes include the full source BEFORE point and match table values for every technology',()=>{
 for(const r of results)for(const metric of fields){const graph=chart.reactorChartData(r,metric);assert.equal(graph.baseline.x,360);assert.ok(graph.domain.xMax>360);assert.equal(graph.selected.x,r.selected.hrtHours);assert.equal(graph.baseline.y,r.baseline[metric]);assert.equal(graph.selected.y,r.selected.outputs[metric]);close(graph.changePct,-r.selected.hrtReductionPct);close(graph.outputPct,r.selected.gains[metric]);}
});

test('model mode retains 2,000 distinct predictions while keeping the original source BEFORE reference',()=>{
 for(const t of meta.technologies){const r=core.calculateReactorSearch({...structuredClone(meta.defaults),technology:t.id,method:'model',generationSeed:'source-before-regression-20261110'});
  assert.equal(r.baseline.hrtHours,360);assert.equal(r.generatedCandidateCount,2000);assert.equal(r.candidateCount,2000);assert.ok(r.selected);assert.equal(r.generation.scope,'SELECTED_REACTOR');assert.ok(r.candidates.every(c=>c.pathway===t.id));
  for(const c of r.candidates){assert.ok(c.hrtHours>=t.observedHrtHours[0]);assert.ok(c.hrtHours<=t.observedHrtHours[1]);close(c.hrtReductionPct,(360-c.hrtHours)/360*100);}
  assert.equal(core.reactorSearchOutputHash(r),core.reactorSearchOutputHash(core.calculateReactorSearch(r.request)));
 }
});

const parseLine=line=>[...line.matchAll(/"((?:[^"]|"")*)"(?=,|$)/g)].map(m=>m[1].replaceAll('""','"'));
test('saved KPI and scenario exports retain source references, exact values and calculation units',()=>{
 for(const calculation of results){const r={...calculation,runId:'source-regression',outputHash:core.reactorSearchOutputHash(calculation)};
  const lines=exports.reactorSearchKpiCsv(r).split('\r\n'),headers=parseLine(lines[0]),kpi=Object.fromEntries(parseLine(lines[1]).map((v,i)=>[headers[i],v]));
  assert.equal(Number(kpi.before),360);assert.equal(Number(kpi.after),r.selected.hrtHours);assert.equal(kpi.hrt_unit,'hours');assert.equal(kpi.before_hrt_column,'BEFORE HRT (h)');assert.equal(kpi.after_hrt_column,'AFTER HRT (h)');assert.equal(kpi.before_source_file,r.baseline.sourceReference.file);
  const csv=exports.reactorSearchCsv(r).split('\r\n');assert.equal(csv.length,401);const names=parseLine(csv[0]),selected=csv.slice(1).map(parseLine).map(v=>Object.fromEntries(v.map((x,i)=>[names[i],x]))).find(row=>row.selected==='true');assert.equal(Number(selected.before_hrt_h),360);assert.equal(Number(selected.after_hrt_h),r.selected.hrtHours);assert.equal(Number(selected.after_electricity_kwh_day),r.selected.outputs.electricityKwhDay);
 }
});

test('source BEFORE mode rejects substituting an already-optimized scenario or manual baseline',()=>{
 for(const baseline of [{origin:'scenario',scenarioId:'T2-A-0001'},{origin:'provided',hrtHours:10.2,biogasM3Day:66,methaneM3Day:42,electricityKwhDay:151}])assert.throws(()=>core.calculateReactorSearch({...meta.defaults,baseline}));
});
