import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {pairedInputs,predictPaired,evaluatePairedScenarios,selectPairedScenario}=require('../app/lib/paired-scenarios.ts');
const {calculateResearch,predictResearch,researchDefaults,researchOutputHash,resolveResearchRequest}=require('../app/lib/hrt-research.ts');
const {researchResultIsConsistent}=require('../app/lib/research-result-integrity.ts');
const fixture=JSON.parse(fs.readFileSync(new URL('../ai-workflow/research/paired-200-2026-11-07/parity.json',import.meta.url),'utf8'));
const keys=['biogasM3Day','methaneM3Day','electricityKwhDay'];
const request={...researchDefaults,objective:'paired_gain',selectionSeed:'paired-test-seed-20261107'};

test('all 2,000 runtime predictions and HRT baselines match independent Python study values',()=>{
  assert.equal(pairedInputs.length,2000);
  assert.equal(new Set(pairedInputs.map(input=>JSON.stringify([input.pathway,input.hrtHours,input.temperature,input.ph,input.feedRate,input.olr]))).size,2000);
  for(const [index,input] of pairedInputs.entries()){
    const expected=fixture.cases[index],prediction=predictPaired(input),baseline=predictResearch(input.hrtHours);
    assert.equal(input.id,expected.id);
    for(const key of ['biogasM3Day','methanePct'])assert.ok(Math.abs(prediction[key]-expected[key])<fixture.tolerance,`${input.id} ${key}`);
    for(const [i,key] of keys.entries())assert.ok(Math.abs(baseline[key]-expected.baseline[i])<fixture.tolerance,`${input.id} baseline ${key}`);
    assert.equal(prediction.methaneM3Day,prediction.biogasM3Day*prediction.methanePct/100);
    assert.equal(prediction.electricityKwhDay,prediction.methaneM3Day*9.97*.36);
  }
});

test('prioritizes all-output >40% candidates, varies selected input, and replays without changing predictions',()=>{
  const evaluations=evaluatePairedScenarios(predictResearch);
  assert.equal(evaluations.filter(row=>row.minimumGainPct>40).length,1272);
  let previous;
  const visited=new Set();
  for(let i=0;i<24;i++){
    const run=calculateResearch({...request,selectionSeed:`paired-test-run-${i}`,...(previous?{previousCandidateId:previous.pairedComparison.input.id}:{})});
    assert.equal(run.candidateCount,2000);assert.equal(run.pairedComparison.trainingRows,200);
    assert.equal(run.pairedComparison.qualifyingCount,1272);assert.equal(run.goal.satisfied,true);
    assert.equal(researchResultIsConsistent(run),true);
    assert.equal(run.workbookBaseline,null);assert.equal(run.energyComparison,null);
    assert.deepEqual(run.comparison,predictResearch(run.selected.hrtHours));
    const predicted=predictPaired(run.pairedComparison.input);
    for(const key of keys){
      assert.equal(run.selected[key],predicted[key]);
      assert.ok(run.pairedComparison.gains[key]>40);
      assert.equal(run.selected.paired.baseline[key],run.comparison[key]);
      if(previous){assert.notEqual(Math.round(run.selected[key]*100),Math.round(previous.selected[key]*100));assert.notEqual(Math.round(run.comparison[key]*100),Math.round(previous.comparison[key]*100));}
    }
    assert.equal(run.selected.h2sBeforePpm,null);assert.equal(run.selected.stabilityPct,null);
    assert.equal(researchOutputHash(calculateResearch(run.request)),researchOutputHash(run));
    if(previous)assert.notEqual(run.pairedComparison.input.id,previous.pairedComparison.input.id);
    visited.add(run.pairedComparison.input.id);previous=run;
  }
  assert.ok(visited.size>20);
});

test('no eligible candidate returns the best actual prediction without an invented uplift',()=>{
  const evaluations=evaluatePairedScenarios(hours=>{
    const base=predictResearch(hours);return Object.fromEntries(keys.map(key=>[key,base[key]*2]));
  });
  const choice=selectPairedScenario(evaluations,'fallback-test-seed');
  assert.equal(choice.qualifying.length,0);
  assert.ok(choice.selected.minimumGainPct<0);
  assert.deepEqual(choice.selected.prediction,predictPaired(choice.selected.input));
  assert.equal(choice.selected.minimumGainPct,Math.max(...evaluations.map(row=>row.minimumGainPct)));
});

test('rejects altered comparison gains and invalid selection requests; fingerprints input identity',()=>{
  const run=calculateResearch(request);
  for(const patch of [{thresholdPct:50},{thresholdMet:false},{gains:{...run.pairedComparison.gains,electricityKwhDay:99}},{input:{...run.pairedComparison.input,hrtHours:2}},{qualifyingCount:0}]){
    assert.equal(researchResultIsConsistent({...run,pairedComparison:{...run.pairedComparison,...patch}}),false);
  }
  assert.notEqual(researchOutputHash(run),researchOutputHash({...run,pairedComparison:{...run.pairedComparison,poolHash:'altered'}}));
  for(const patch of [{selectionSeed:'bad'},{previousCandidateId:'PAIR-9999'},{scenario:{mode:'automatic'}},{objective:'workbook_gain',selectionSeed:'valid-seed-2026'}])assert.throws(()=>resolveResearchRequest({...request,...patch}));
  assert.throws(()=>calculateResearch({...researchDefaults,objective:'paired_gain'}),error=>error.issues.some(issue=>issue.field==='selectionSeed'));
});
