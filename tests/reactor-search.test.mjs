import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const old=require('../app/lib/reactor-optimization.ts'),gen=require('../app/lib/reactor-scenario-generator.ts'),core=require('../app/lib/reactor-search.ts'),exports=require('../app/lib/reactor-search-execution.ts');
const source=require('../ai-workflow/research/reactor-study-2026-11-09/scenarios.json'),model=require('../ai-workflow/research/reactor-study-2026-11-09/model.json');
const request=()=>({...structuredClone(old.reactorDefaults),generationSeed:'auditor-seed-20261109'}),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const sourceKeys=new Set(source.map(gen.reactorInputKey));
const results=old.reactorMetadata().technologies.map(t=>core.calculateReactorSearch({...request(),technology:t.id,baseline:{origin:'scenario',scenarioId:t.defaultBaselineId}}));

test('each of nine reactor models evaluates 2,000 unique new inputs with same-configuration lineage',()=>{
 for(const r of results){
  assert.equal(r.candidateCount,2000);assert.equal(r.generatedCandidateCount,2000);assert.equal(r.trainingSourceCount,400);assert.equal(r.sameTechnologyCandidateCount,2000);
  assert.equal(new Set(r.candidates.map(gen.reactorInputKey)).size,2000);assert.equal(new Set(r.candidates.map(c=>c.id)).size,2000);
  for(const c of r.candidates){assert.ok(!sourceKeys.has(gen.reactorInputKey(c)));assert.equal(c.pathway,r.baseline.pathway);assert.equal(c.configuration,r.baseline.configuration);assert.equal(c.sourceOutputs,null);assert.ok(gen.generatedInputIsTraceable(c));const a=source.find(s=>s.id===c.provenance.parentAId),b=source.find(s=>s.id===c.provenance.parentBId);for(const key of gen.reactorInputFields)assert.ok(c[key]>=Math.min(a[key],b[key])-1e-9&&c[key]<=Math.max(a[key],b[key])+1e-9);}
 }
});
test('generated predictions independently reproduce fitted coefficients and all physical conversions',()=>{
 for(const r of results)for(const c of r.candidates){const m=model.models[c.pathway],z=[1,...m.features.map((key,i)=>(c[key]-m.fit.mean[i])/m.fit.scale[i])],prediction=[0,1].map(target=>z.reduce((sum,value,i)=>sum+value*m.fit.coefficients[i][target],0));close(c.outputs.biogasM3Day,prediction[0]);close(c.outputs.methanePct,prediction[1]);close(c.outputs.methaneM3Day,prediction[0]*prediction[1]/100);close(c.outputs.electricityKwhDay,c.outputs.methaneM3Day*9.97*.36);close(c.outputs.annualElectricityKwh,c.outputs.electricityKwhDay*365);assert.ok(c.outputs.methanePct>0&&c.outputs.methanePct<=100);}
});
test('new seeds change the pool while seeded replay and baseline remain stable',()=>{
 const a=results.find(r=>r.request.technology==='H1'),b=core.calculateReactorSearch({...a.request,generationSeed:'different-seed-20261109'}),replay=core.calculateReactorSearch(a.request);
 assert.equal(core.reactorSearchOutputHash(a),core.reactorSearchOutputHash(replay));assert.equal(a.generation.poolHash,replay.generation.poolHash);assert.notEqual(a.generation.poolHash,b.generation.poolHash);assert.notDeepEqual(a.candidates,b.candidates);assert.deepEqual(a.baseline,b.baseline);
});
test('selection enforces lower HRT and genuine gains without changing a failing baseline',()=>{
 for(const r of results){for(const c of r.candidates.filter(c=>c.eligible)){assert.ok(c.hrtHours<r.baseline.hrtHours);for(const key of old.reactorProductionKeys){assert.ok(c.outputs[key]>r.baseline[key]);close(c.gains[key],(c.outputs[key]/r.baseline[key]-1)*100);}}if(r.selected){assert.equal(r.selected.hrtHours,Math.min(...r.candidates.filter(c=>c.eligible).map(c=>c.hrtHours)));for(const key of old.reactorProductionKeys)close(r.annual.selected[key],r.selected.outputs[key]*365);}else assert.equal(r.annual.selected,null);}
 const q=request();q.constraints.maxHrtHours=4;const fail=core.calculateReactorSearch(q);assert.equal(fail.selected,null);assert.equal(fail.baseline.hrtHours,10.2);assert.equal(fail.status,'NO_QUALIFYING_CANDIDATE');
 const optimal=core.calculateReactorSearch({...request(),baseline:{origin:'scenario',scenarioId:'T2-B-0133'}});assert.equal(optimal.baseline.scenarioId,'T2-B-0133');assert.equal(optimal.selected,null);
});
test('upgrade generation covers all nine reactors with 2,000 predictions, source mode retains 400 originals',()=>{
 const r=core.calculateReactorSearch({...request(),mode:'upgrade',baseline:{origin:'workbook'}});assert.equal(r.baseline.hrtHours,360);assert.equal(r.candidateCount,2000);assert.equal(new Set(r.candidates.map(c=>c.pathway)).size,9);for(const id of new Set(r.candidates.map(c=>c.pathway)))assert.ok([222,223].includes(r.candidates.filter(c=>c.pathway===id).length));
 const q={...request(),method:'source',generationSeed:null},s=core.calculateReactorSearch(q),oldRun=old.calculateReactorStudy(q);assert.equal(s.candidateCount,400);assert.equal(s.generatedCandidateCount,0);assert.equal(s.modelPredictionEnabled,false);assert.deepEqual(s.candidates,oldRun.candidates);assert.deepEqual(s.baseline,oldRun.baseline);assert.equal(s.generation.seed,null);
});
test('missing baselines, invalid seeds, feed and loading-unit exclusions stay explicit',()=>{
 const r=core.calculateReactorSearch({...request(),baseline:{origin:'provided',hrtHours:30,biogasM3Day:0,methaneM3Day:null,electricityKwhDay:null}});assert.ok(r.selected);assert.deepEqual(r.selected.gains,{biogasM3Day:null,methaneM3Day:null,electricityKwhDay:null});assert.equal(r.annual.baseline.methaneM3Day,null);
 for(const change of [{generationSeed:null},{generationSeed:'x'},{generationSeed:'bad seed 123'},{generationSeed:5},{technology:'invalid'},{baseline:{origin:'scenario',scenarioId:'T2-A-0007'}},{baseline:{origin:'workbook'}}])assert.throws(()=>core.calculateReactorSearch({...request(),...change}));
 assert.equal(core.calculateReactorSearch({...request(),feed:'solids'}).selected,null);
 const c=results.find(r=>r.request.technology==='C2');assert.equal(core.calculateReactorSearch({...c.request,constraints:{...c.request.constraints,olrMax:100,olrBasis:'COD'}}).selected,null);
 const corrupted=structuredClone(results[0].candidates[0]);corrupted.hrtHours+=1;assert.equal(gen.generatedInputIsTraceable(corrupted),false);
});
test('2,000-row exports retain exact inputs, predictions and parents; KPI export agrees; responses fit platform limit',()=>{
 for(const calculation of results){const r={...calculation,runId:'test-run',outputHash:core.reactorSearchOutputHash(calculation)};assert.ok(Buffer.byteLength(JSON.stringify(r))<4_000_000);const csv=exports.reactorSearchCsv(r);assert.equal(csv.split('\r\n').length,2001);assert.match(csv.split('\r\n')[0],/parent_a_sha256/);assert.match(csv.split('\r\n')[0],/generation_seed/);const lines=exports.reactorSearchKpiCsv(r).split('\r\n');assert.equal(lines.length,8);const fields=lines[2].split(',').map(v=>v.slice(1,-1));close(Number(fields[2]),r.baseline.biogasM3Day);if(r.selected)close(Number(fields[3]),r.selected.outputs.biogasM3Day);else assert.equal(fields[3],'');}
});
