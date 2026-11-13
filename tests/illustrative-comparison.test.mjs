import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {illustrativeComparison} from '../app/lib/illustrative-comparison.ts';

test('illustrative fallback is separate from its unchanged baseline and scales compatible units together',()=>{
  const baseline=Object.freeze({hrtHours:2.5,biogasM3Day:84.819433,methaneM3Day:28.46517,electricityKwhDay:28.46517*9.97*.36});
  const original=JSON.stringify(baseline),runId=randomUUID(),demo=illustrativeComparison(baseline,runId);
  assert.equal(demo.kind,'ILLUSTRATIVE_DEMO');assert.ok(demo.assumedGainPct>=5&&demo.assumedGainPct<=10);
  for(const key of ['biogasM3Day','methaneM3Day','electricityKwhDay'])assert.ok(Math.abs(demo.illustrative[key]/baseline[key]-(1+demo.assumedGainPct/100))<1e-12);
  assert.deepEqual(illustrativeComparison(baseline,runId),demo,'Revisiting a run preserves its sample');
  assert.ok(Math.abs(demo.illustrative.electricityKwhDay-demo.illustrative.methaneM3Day*9.97*.36)<1e-10);
  assert.equal(JSON.stringify(baseline),original);assert.notEqual(demo.baseline,baseline);
  assert.equal('audit' in demo,false);assert.equal('selected' in demo,false);assert.equal('hrtHours' in demo.illustrative,false);
});

test('missing or invalid baseline cannot generate illustrative gains',()=>{
  assert.equal(illustrativeComparison(null,'test'),null);
  for(const value of [0,-1,NaN,Infinity])assert.equal(illustrativeComparison({hrtHours:2.5,biogasM3Day:value,methaneM3Day:28,electricityKwhDay:100},'test'),null);
  assert.equal(illustrativeComparison({hrtHours:24,biogasM3Day:66,methaneM3Day:42,electricityKwhDay:150},''),null);
});

test('new run IDs sample gains within 5–10% without changing conversion or baseline',()=>{
  const baseline=Object.freeze({hrtHours:24,biogasM3Day:66,methaneM3Day:42,electricityKwhDay:42*9.97*.36});
  const gains=new Set();
  for(let i=0;i<1000;i++){
    const demo=illustrativeComparison(baseline,randomUUID());gains.add(demo.assumedGainPct);
    assert.ok(demo.assumedGainPct>=5&&demo.assumedGainPct<=10);
    assert.ok(Math.abs(demo.illustrative.electricityKwhDay-demo.illustrative.methaneM3Day*9.97*.36)<1e-10);
  }
  assert.ok(gains.size>100,'Completed runs should produce varied presentation scenarios');
});
