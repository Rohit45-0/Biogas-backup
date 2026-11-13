import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {productionHrtChartData,productionHrtMetrics}=require('../app/lib/production-hrt-chart.ts');
const {calculateResearch,researchDefaults,researchOutputHash}=require('../app/lib/hrt-research.ts');
const request={...researchDefaults,objective:'paired_gain',selectionSeed:'production-hrt-charts-20261110'};
const run=calculateResearch(request),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('all three production HRT graphs use all 2,000 saved model evaluations and preserve the calculation',()=>{
 const hash=researchOutputHash(run);
 for(const metric of Object.keys(productionHrtMetrics)){
  const data=productionHrtChartData(run,metric);
  assert.equal(data.points.length,2000);
  assert.equal(new Set(data.points.map(p=>p.id)).size,2000);
  for(const p of data.points){const candidate=run.candidates.find(c=>c.paired.input.id===p.id);assert.equal(p.x,candidate.hrtHours);assert.equal(p.y,candidate[metric]);}
  assert.deepEqual(data.selected,{x:run.selected.hrtHours,y:run.selected[metric]});
  assert.deepEqual(data.baseline,{x:run.comparison.hrtHours,y:run.comparison[metric]});
  close(data.outputPct,run.pairedComparison.gains[metric]);
 }
 assert.equal(researchOutputHash(run),hash);
});

test('baseline series uses saved candidate baselines, sorted and deduplicated by HRT',()=>{
 for(const metric of Object.keys(productionHrtMetrics)){
  const data=productionHrtChartData(run,metric);
  assert.equal(data.baselineCurve.length,new Set(run.candidates.map(c=>c.hrtHours)).size);
  data.baselineCurve.forEach((p,i)=>{assert.equal(p.y,run.candidates.find(c=>c.hrtHours===p.x).paired.baseline[metric]);if(i)assert.ok(p.x>data.baselineCurve[i-1].x);});
 }
});

test('descriptive HRT bands include each prediction exactly once and preserve arithmetic means',()=>{
 const data=productionHrtChartData(run,'methaneM3Day');
 assert.equal(data.trend.length,12);
 assert.equal(data.trend.reduce((s,p)=>s+p.count,0),2000);
 for(const key of ['x','y'])close(data.trend.reduce((s,p)=>s+p[key]*p.count,0)/2000,data.points.reduce((s,p)=>s+p[key],0)/2000);
});

test('same-HRT comparisons never invent time reduction; signed increases and decreases are explicit',()=>{
 const actual=productionHrtChartData(run,'biogasM3Day');
 assert.equal(actual.changeHours,0);assert.equal(actual.direction,'unchanged');
 for(const [change,direction] of [[-2,'decrease'],[2,'increase']]){
  const data=productionHrtChartData({...run,selected:{...run.selected,hrtHours:run.comparison.hrtHours+change}},'electricityKwhDay');
  assert.equal(data.changeHours,change);assert.equal(data.direction,direction);
 }
});

test('new selected input updates markers and gains without changing the saved candidate pool',()=>{
 const next=calculateResearch({...request,selectionSeed:'production-hrt-next',previousCandidateId:run.pairedComparison.input.id});
 assert.notEqual(next.pairedComparison.input.id,run.pairedComparison.input.id);
 for(const metric of Object.keys(productionHrtMetrics)){
  const data=productionHrtChartData(next,metric);
  assert.deepEqual(data.selected,{x:next.selected.hrtHours,y:next.selected[metric]});
  close(data.outputPct,next.pairedComparison.gains[metric]);
 }
 assert.deepEqual(next.candidates,run.candidates);
});

test('missing/zero baselines, empty pools, identical HRTs and non-finite points are handled safely',()=>{
 const missing=productionHrtChartData({...run,comparison:null,candidates:[]},'biogasM3Day');
 assert.equal(missing.outputPct,null);assert.equal(missing.changeHours,null);assert.equal(missing.direction,'unavailable');
 const zero=productionHrtChartData({...run,comparison:{...run.comparison,biogasM3Day:0}},'biogasM3Day');assert.equal(zero.outputPct,null);
 const collapsed=productionHrtChartData({...run,candidates:[run.selected,{...run.selected,hrtHours:NaN},{...run.selected,biogasM3Day:Infinity}]},'biogasM3Day');
 assert.equal(collapsed.points.length,1);assert.equal(collapsed.trend.length,1);
 for(const data of [missing,zero,collapsed]){
  assert.ok(Object.values(data.domain).every(Number.isFinite));assert.ok(data.domain.xMax>data.domain.xMin);assert.ok(data.domain.yMax>data.domain.yMin);
  for(const p of [...data.points,...data.baselineCurve,...(data.baseline?[data.baseline]:[]),...(data.selected?[data.selected]:[])]){
   assert.ok(p.x>=data.domain.xMin&&p.x<=data.domain.xMax);assert.ok(p.y>=data.domain.yMin&&p.y<=data.domain.yMax);
  }
 }
});
