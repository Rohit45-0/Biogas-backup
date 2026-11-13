import assert from 'node:assert/strict';
import test from 'node:test';
import {researchImprovement,improvementPercent} from '../app/lib/research-improvement.ts';

const current={biogasM3Day:50,methaneM3Day:30,electricityKwhDay:107.676};
test('AI improvement reports signed differences, annual gains and actual percentages',()=>{
  const metrics=researchImprovement(current,{biogasM3Day:60,methaneM3Day:33,electricityKwhDay:118.4436});
  assert.equal(metrics[0].percent,20);assert.equal(metrics[0].annualChange,3650);
  assert.ok(Math.abs(metrics[2].percent-10)<1e-10);
  assert.ok(Math.abs(metrics[2].annualChange-3930.174)<1e-9);
  assert.equal(improvementPercent(metrics[0].percent),'+20%');
});
test('zero, missing comparison and negative outcomes remain distinct',()=>{
  assert.ok(researchImprovement(current,current).every(m=>m.change===0&&m.percent===0));
  assert.ok(researchImprovement(null,current).every(m=>m.change===null&&m.percent===null));
  assert.equal(improvementPercent(0),'0%');assert.equal(improvementPercent(null),'Not comparable');
  assert.equal(improvementPercent(-5),'-5%');assert.equal(improvementPercent(.0075),'+<0.01%');
  assert.equal(improvementPercent(-.0075),'−<0.01%');
});
