import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {calculateResearch,researchDefaults,researchRows,predictResearch,researchOutputHash}=require('../app/lib/hrt-research.ts');
const {researchResultIsConsistent}=require('../app/lib/research-result-integrity.ts');
const {productionBaseline,selectedProduction,chooseWorkbookCandidate,chooseEnergyCandidate}=require('../app/lib/workbook-comparison.ts');
const {researchImprovement}=require('../app/lib/research-improvement.ts');
const request={...researchDefaults,objective:'workbook_gain'};

test('workbook selection visits all 956 qualifying model scenarios without inventing energy baselines',()=>{
  assert.deepEqual([...new Set(researchRows.map(row=>row.baselineBiogasM3Day))],[50]);
  let previous,first;const visited=new Set();
  for(let i=0;i<956;i++){
    const run=calculateResearch({...request,...(previous===undefined?{}:{previousSelectedHrtHours:previous})});
    first??=run;
    assert.equal(run.candidateCount,2000);
    assert.equal(run.workbookBaseline.qualifyingCount,956);
    assert.equal(run.workbookBaseline.biogasM3Day,50);
    assert.ok(run.workbookBaseline.selectedGainPct>=50);
    assert.equal(run.comparison,null);
    for(const key of ['methaneM3Day','electricityKwhDay','hrtHours'])assert.equal(run.workbookBaseline[key],null);
    assert.equal(run.retentionTime.beforeHours,null);assert.equal(run.retentionTime.changeHours,null);
    assert.ok(run.recommendations.every(row=>row.current===null&&row.change===null));
    assert.deepEqual(run.selected,predictResearch(run.selected.hrtHours));
    assert.equal(researchResultIsConsistent(run),true);
    assert.equal(visited.has(run.selected.hrtHours),false);
    visited.add(run.selected.hrtHours);previous=run.selected.hrtHours;
    const gains=researchImprovement(productionBaseline(run),selectedProduction(run));
    assert.ok(gains.every(gain=>gain.percent>=50));
    for(const key of ['biogasM3Day','methaneM3Day','electricityKwhDay']){
      const annual=run.selected[key]*365,months=[31,28,31,30,31,30,31,31,30,31,30,31].reduce((sum,days)=>sum+run.selected[key]*days,0);
      assert.ok(Math.abs(months-annual)<1e-7);
    }
  }
  assert.equal(calculateResearch({...request,previousSelectedHrtHours:previous}).selected.hrtHours,first.selected.hrtHours);
  assert.notEqual(researchOutputHash(first),researchOutputHash({...first,workbookBaseline:{...first.workbookBaseline,biogasM3Day:49}}));
  assert.equal(researchResultIsConsistent({...first,workbookBaseline:{...first.workbookBaseline,electricityKwhDay:50}}),false);
  assert.equal(researchResultIsConsistent({...first,workbookBaseline:{...first.workbookBaseline,selectedGainPct:99}}),false);
  assert.deepEqual(calculateResearch(first.request),first);
});

test('independent energy study visits 1070 actual model points with reconciled gains and explicit biogas trade-off',()=>{
  let previous,first;const visited=new Set();
  for(let i=0;i<1070;i++){
    const run=calculateResearch({...request,...(previous===undefined?{}:{previousEnergySelectedHrtHours:previous})});
    const e=run.energyComparison;first??=run;
    assert.equal(e.basis,'MODELLED_2H_ENERGY_STUDY');assert.equal(e.qualifyingCount,1070);
    assert.deepEqual(e.baseline,predictResearch(2));assert.deepEqual(e.selected,predictResearch(e.selected.hrtHours));
    assert.ok(e.methaneGainPct>=50&&e.electricityGainPct>=50);assert.ok(e.biogasChangePct<0);
    assert.ok(Math.abs(e.methaneGainPct-e.electricityGainPct)<1e-10);
    assert.equal(e.retentionTime.direction,'increase');assert.equal(e.retentionTime.beforeHours,2);
    assert.equal(researchResultIsConsistent(run),true);
    assert.equal(visited.has(e.selected.hrtHours),false);visited.add(e.selected.hrtHours);previous=e.selected.hrtHours;
    const outputs=selectedProduction(run),baseline=productionBaseline(run);
    assert.equal(outputs.biogasM3Day,run.selected.biogasM3Day);assert.equal(outputs.methaneM3Day,e.selected.methaneM3Day);
    assert.equal(baseline.biogasM3Day,50);assert.equal(baseline.electricityKwhDay,e.baseline.electricityKwhDay);
    assert.notEqual(e.selected.hrtHours,run.selected.hrtHours);
  }
  assert.equal(calculateResearch({...request,previousEnergySelectedHrtHours:previous}).energyComparison.selected.hrtHours,first.energyComparison.selected.hrtHours);
  assert.equal(first.energyComparison.selected.electricityKwhDay,Math.max(...first.candidates.map(p=>p.electricityKwhDay)));
  assert.deepEqual(calculateResearch(first.request),first);
  for(const patch of [{methaneGainPct:99},{electricityGainPct:NaN},{biogasChangePct:0},{baseline:{...first.energyComparison.baseline,hrtHours:3}},{selected:{...first.energyComparison.selected,electricityKwhDay:999}}]){
    const changed={...first,energyComparison:{...first.energyComparison,...patch}};
    assert.equal(researchResultIsConsistent(changed),false);assert.notEqual(researchOutputHash(changed),researchOutputHash(first));
  }
  assert.throws(()=>chooseEnergyCandidate([predictResearch(2)],predictResearch(2)),/No model scenario/);
  assert.throws(()=>chooseEnergyCandidate(first.candidates,{...predictResearch(2),methaneM3Day:0}),/baseline is unavailable/);
  for(const value of [NaN,1,25,'2'])assert.throws(()=>calculateResearch({...request,previousEnergySelectedHrtHours:value}),error=>error.issues?.some(issue=>issue.field==='previousEnergySelectedHrtHours'));
});

test('workbook mode does not fabricate candidates, lower baselines or modify the existing HRT study',()=>{
  assert.throws(()=>chooseWorkbookCandidate([{hrtHours:2,biogasM3Day:70}],50),/No model scenario/);
  assert.throws(()=>chooseWorkbookCandidate([],0),/baseline is unavailable/);
  assert.throws(()=>calculateResearch({...request,scenario:{mode:'automatic'}}),error=>error.issues?.some(issue=>/Workbook comparison/.test(issue.message)));
  const legacy=calculateResearch({...researchDefaults,baseline:{value:13.5,unit:'hours'}});
  assert.equal(legacy.jointImprovement.status,'NO_JOINT_IMPROVEMENT');
  assert.deepEqual(legacy.selected,legacy.comparison);assert.equal(legacy.workbookBaseline,null);
  const oldImprovement=calculateResearch({...researchDefaults,objective:'maximum_energy'});
  assert.ok(oldImprovement.selected.electricityKwhDay>oldImprovement.comparison.electricityKwhDay);
});
