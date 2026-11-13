import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {sameTankModel,sameTankInputs,sameTankSource,predictSameTank,sourceBefore}=require('../app/lib/same-tank-model.ts');
const {calculateResearch,researchDefaults,researchOutputHash,resolveResearchRequest}=require('../app/lib/hrt-research.ts');
const {researchResultIsConsistent}=require('../app/lib/research-result-integrity.ts');
const {productionHrtChartData}=require('../app/lib/production-hrt-chart.ts');
const {checkScenarioInputs}=require('../app/lib/scenario-input-coverage.ts');
const parity=require('../ai-workflow/research/same-tank-500-2026-11-10/parity.json');
const keys=['biogasM3Day','methaneM3Day','electricityKwhDay'];
const request={...researchDefaults,objective:'same_tank_gain',sameTankStage:'R5',selectionSeed:'same-tank-test-20261110'};
test('all 2000 distinct generated inputs match independent Python inference; source IDs and targets are excluded',()=>{
 assert.equal(sameTankSource.rows.length,500);assert.equal(sameTankInputs.length,2000);
 assert.equal(new Set(sameTankInputs.map(i=>JSON.stringify([i.stage,...i.values]))).size,2000);
 assert.deepEqual(sameTankModel.features,['stage','afterHrtHours','temperatureC','ph','srtDays']);
 for(const [i,input] of sameTankInputs.entries()){
  const p=predictSameTank(input);for(const key of [...keys,'methanePct'])assert.ok(Math.abs(p[key]-parity.cases[i][key])<1e-8,`${input.id} ${key}`);
  const a=sameTankSource.rows[input.parentA-1],b=sameTankSource.rows[input.parentB-1];
  assert.equal(a.Stage,input.stage);assert.equal(b.Stage,input.stage);
  const columns=['AFTER HRT (h)','Temp (C)','pH','SRT (d)'];columns.forEach((key,j)=>assert.ok(Math.abs(input.values[j]-(a[key]*(1-input.weightB)+b[key]*input.weightB))<1e-9));
 }
});
test('every stage preserves exact source BEFORE values, selects only its own supported stage and replays',()=>{
 for(const stage of sameTankModel.stageInfo){
  const run=calculateResearch({...request,sameTankStage:stage.id});
  const source=sourceBefore(run.pairedComparison.input.parentA);
  assert.equal(run.pairedComparison.trainingRows,500);assert.equal(run.candidateCount,2000);
  for(const key of ['hrtHours','methanePct',...keys])assert.equal(run.comparison[key],source[key]);
  assert.equal(run.pairedComparison.input.pathway,stage.id);
  assert.ok(run.selected.hrtHours>=stage.min[0]&&run.selected.hrtHours<=stage.max[0]);
  assert.ok(run.selected.hrtHours<run.comparison.hrtHours);assert.ok(Math.abs(run.retentionTime.changeHours-(run.selected.hrtHours-source.hrtHours))<=.005);
  assert.equal(researchResultIsConsistent(run),true);
  assert.equal(researchOutputHash(calculateResearch(run.request)),researchOutputHash(run));
  for(const key of keys)assert.equal(run.pairedComparison.gains[key],(run.selected[key]/source[key]-1)*100);
  if(stage.id==='R6')assert.ok(run.selected.hrtHours>=72.3,'plain mixed tank must not be given a 4-hour candidate');
 }
});
test('reruns change candidate inputs without changing source baseline or model predictions',()=>{
 let previous;const ids=new Set();
 for(let i=0;i<10;i++){
  const run=calculateResearch({...request,selectionSeed:`same-tank-run-${i}`,previousCandidateId:previous?.pairedComparison.input.id});
  assert.equal(run.goal.satisfied,true);assert.ok(run.pairedComparison.minimumGainPct>40);
  if(previous){assert.notEqual(run.pairedComparison.input.id,previous.pairedComparison.input.id);assert.deepEqual(run.comparison,previous.comparison);}
  const input=sameTankInputs.find(input=>input.id===run.pairedComparison.input.id),prediction=predictSameTank(input);
  for(const key of keys)assert.equal(run.selected[key],prediction[key]);
  ids.add(input.id);previous=run;
 }
 assert.ok(ids.size>=8);
});
test('all three HRT graphs include source 360-hour baseline and saved prediction; no invented fitted baseline curve',()=>{
 const run=calculateResearch(request);
 for(const key of keys){
  const graph=productionHrtChartData(run,key);assert.equal(graph.baseline.x,run.comparison.hrtHours);assert.equal(graph.baseline.y,run.comparison[key]);
  assert.equal(graph.selected.x,run.selected.hrtHours);assert.equal(graph.selected.y,run.selected[key]);
  assert.ok(graph.domain.xMax>=run.comparison.hrtHours);assert.equal(graph.baselineCurve.length,0);
  assert.equal(graph.points.length,run.candidates.filter(p=>p.paired.input.pathway==='R5').length);
  assert.equal(graph.direction,'decrease');assert.ok(Math.abs(graph.outputPct-run.pairedComparison.gains[key])<1e-10);
 }
});
test('invalid stage, mixed-source IDs, out-of-range inputs and altered comparisons are rejected',()=>{
 assert.throws(()=>resolveResearchRequest({...request,sameTankStage:'H1'}));
 assert.throws(()=>resolveResearchRequest({...request,previousCandidateId:'PAIR-0001'}));
 assert.throws(()=>predictSameTank({...sameTankInputs[0],values:[2,55,7,4]}));
 const run=calculateResearch(request);
 for(const mutation of [r=>r.comparison.hrtHours=6,r=>r.selected.electricityKwhDay*=1.1,r=>r.pairedComparison.trainingRows=200,r=>r.pairedComparison.gains.biogasM3Day=99,r=>r.pairedComparison.input.pathway='R6']){
  const altered=structuredClone(run);mutation(altered);assert.equal(researchResultIsConsistent(altered),false);
 }
});
test('same-tank scenario alerts use stage-specific ranges and do not reuse old 2–24-hour coverage',()=>{
 const run=calculateResearch({...request,sameTankStage:'R1'}),input=run.pairedComparison.input;
 const body={stream:'task1',contextId:'task1:same-tank:R1',values:{hrtHours:input.hrtHours,temperatureC:input.temperature,ph:input.ph,srtDays:input.srtDays}};
 assert.equal(checkScenarioInputs(body).status,'WITHIN_SCENARIO_RANGES');
 assert.equal(checkScenarioInputs({...body,values:{...body.values,hrtHours:4}}).status,'OUT_OF_RANGE');
});
