import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {scenarioCoverageCatalog:catalog,checkScenarioInputs}=require('../app/lib/scenario-input-coverage.ts');
const {emptyScenarioAlerts,recordScenarioCheck,acknowledgeScenarioAlert,restoreScenarioAlerts}=require('../app/lib/scenario-alert-state.ts');
const h1=catalog.contexts.find(item=>item.id==='task2:H1');
const check=(values=h1.example,contextId=h1.id,stream='manual')=>checkScenarioInputs({contextId,values,stream,sampleLabel:'Test scenario'});

test('reference boundaries are inclusive and numerical excursions trigger explicit notifications',()=>{
  const field=h1.fields.find(item=>item.key==='hrtHours');
  for(const value of [field.min,field.max])assert.equal(check({...h1.example,hrtHours:value}).outsideCount,0);
  for(const value of [field.min-.01,field.max+.01]){
    const result=check({...h1.example,hrtHours:value});assert.equal(result.status,'OUT_OF_RANGE');assert.equal(result.outsideCount,1);
    const detail=result.fields.find(item=>item.key==='hrtHours');assert.equal(detail.value,value);assert.equal(detail.min,field.min);assert.equal(detail.max,field.max);assert.equal(result.dataSource,'SCENARIO_DATA');
  }
  assert.equal(check({...h1.example,hrtHours:0}).status,'OUT_OF_RANGE');
});

test('Task 1 input pool and Task 2 source scenarios do not generate false alarms',()=>{
  const pool=JSON.parse(fs.readFileSync('ai-workflow/research/paired-200-2026-11-07/inputs.json','utf8'));
  for(const row of pool.rows){const result=checkScenarioInputs({contextId:`task1:${row[1]}`,stream:'task1',values:{hrtHours:row[3],temperatureC:row[4],ph:row[5],feedRate:row[6],olr:row[7]}});assert.equal(result.status,'WITHIN_SCENARIO_RANGES',row[0]);}
  const rows=JSON.parse(fs.readFileSync('ai-workflow/research/hrt-optimization-2026-11-08/scenarios.json','utf8'));
  for(const row of rows){const values=Object.fromEntries(['hrtHours','temperatureC','ph','srtDays','upflowMHour','olr'].map(key=>[key,row[key]]));const result=check(values,`task2:${row.pathway}`,'task2');assert.equal(result.outsideCount,0,row.id);assert.equal(result.status,row.olrBasis==='COD'?'WITHIN_SCENARIO_RANGES':'PARTIAL_CHECK');}
});

test('technology-specific ranges, HRT hours, SRT days and unresolved COD/VS remain distinct',()=>{
  const c1=catalog.contexts.find(item=>item.id==='task2:C1');assert.ok(c1.fields.find(field=>field.key==='hrtHours').min>h1.fields.find(field=>field.key==='hrtHours').max);
  const result=check(c1.example,c1.id);assert.equal(result.status,'PARTIAL_CHECK');assert.equal(result.fields.find(field=>field.key==='olr').status,'UNAVAILABLE');
  assert.equal(result.fields.find(field=>field.key==='srtDays').unit,'days');assert.equal(result.fields.find(field=>field.key==='hrtHours').unit,'h');
  // BEFORE HRT and production floors are never accepted as current operating inputs.
  assert.throws(()=>check({...h1.example,baselineHrtHours:360}));assert.throws(()=>check({...h1.example,temperatureMaxC:100}));
});

test('missing values cannot produce an all-clear status and invalid schema is rejected',()=>{
  assert.equal(check({}).status,'PARTIAL_CHECK');assert.equal(check({...h1.example,ph:null}).fields.find(item=>item.key==='ph').status,'MISSING');
  for(const value of [NaN,Infinity,'7.2'])assert.throws(()=>check({...h1.example,ph:value}));
  assert.throws(()=>check(h1.example,'not-a-context'));assert.throws(()=>check(h1.example,h1.id,'task1'));
});

test('duplicate checks do not spam; acknowledgement preserves active warning; correction resolves',()=>{
  const outside=check({...h1.example,temperatureC:100});let state=recordScenarioCheck(emptyScenarioAlerts(),outside);
  state=recordScenarioCheck(state,check({...h1.example,temperatureC:100}));assert.equal(state.events.length,1);
  state=acknowledgeScenarioAlert(state,outside.id);assert.equal(state.events[0].acknowledged,true);assert.equal(state.events[0].state,'active');
  state=recordScenarioCheck(state,check({...h1.example,temperatureC:null}));assert.equal(state.events[0].state,'active');
  state=recordScenarioCheck(state,check());assert.equal(state.events[0].state,'resolved');
  state=recordScenarioCheck(state,check({...h1.example,temperatureC:100}));assert.equal(state.events.length,2);assert.equal(state.events[0].acknowledged,false);
});

test('an unrelated unavailable loading unit does not prevent correction of a temperature alarm',()=>{
  const c1=catalog.contexts.find(item=>item.id==='task2:C1');
  let state=recordScenarioCheck(emptyScenarioAlerts(),check({...c1.example,temperatureC:100},c1.id));
  state=recordScenarioCheck(state,check(c1.example,c1.id));assert.equal(state.events[0].state,'resolved');
});

test('in-range optimization cannot erase a manual scenario warning; history cap retains unresolved alerts',()=>{
  let state=recordScenarioCheck(emptyScenarioAlerts(),check({hrtHours:30},'hours','task1'));
  for(let i=0;i<40;i++)state=recordScenarioCheck(state,check({...h1.example,temperatureC:100+i}));
  assert.equal(state.events.length,30);assert.equal(state.events.filter(event=>event.state==='active').length,2);
  state=recordScenarioCheck(state,check(h1.example,h1.id,'task2'));assert.equal(state.events.filter(event=>event.state==='active').length,2);
  state=recordScenarioCheck(state,check({hrtHours:24},'hours','task1'));assert.equal(state.events.filter(event=>event.state==='active').length,1);
});

test('same-version session restore works and stale source-data caches are invalidated',()=>{
  const state=recordScenarioCheck(emptyScenarioAlerts(),check({...h1.example,ph:12}));
  assert.deepEqual(restoreScenarioAlerts({catalogHash:catalog.catalogHash,state},catalog.catalogHash),state);
  assert.deepEqual(restoreScenarioAlerts({catalogHash:'old',state},catalog.catalogHash),emptyScenarioAlerts());
  assert.deepEqual(restoreScenarioAlerts(null,catalog.catalogHash),emptyScenarioAlerts());
});
