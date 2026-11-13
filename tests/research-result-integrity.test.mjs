import assert from 'node:assert/strict';
import test from 'node:test';
import {researchResultIsConsistent} from '../app/lib/research-result-integrity.ts';

const point=(hrtHours,biogasM3Day,methanePct)=>{
  const methaneM3Day=biogasM3Day*methanePct/100;
  return {hrtHours,biogasM3Day,methanePct,methaneM3Day,electricityKwhDay:methaneM3Day*9.97*.36};
};
const current=point(24,66.15,63.6);
const improved=point(22.2,67.13,63);
const oldTwoHour=point(2,85,32.2);

test('only a reconciled, jointly improving result can be labelled AI improved',()=>{
  assert.equal(researchResultIsConsistent({comparison:current,selected:improved,jointImprovement:{status:'IMPROVED'}}),true);
  assert.equal(researchResultIsConsistent({comparison:current,selected:oldTwoHour,jointImprovement:{status:'IMPROVED'}}),false);
  assert.equal(researchResultIsConsistent({comparison:current,selected:oldTwoHour}),false);
  assert.equal(researchResultIsConsistent({comparison:current,selected:current,jointImprovement:{status:'NO_JOINT_IMPROVEMENT'}}),true);
  assert.equal(researchResultIsConsistent({comparison:current,selected:oldTwoHour,jointImprovement:{status:'NO_JOINT_IMPROVEMENT'}}),false);
  assert.equal(researchResultIsConsistent({comparison:current,selected:{...improved,electricityKwhDay:improved.electricityKwhDay+20},jointImprovement:{status:'IMPROVED'}}),false);
});
