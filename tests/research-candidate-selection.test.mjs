import assert from 'node:assert/strict';
import test from 'node:test';
import {improvesProduction,differentDisplayedProduction,chooseProductionCandidate} from '../app/lib/research-candidate-selection.ts';

const current={hrtHours:24,biogasM3Day:66.15,methaneM3Day:42.089,electricityKwhDay:151.066};
const first={hrtHours:19.5,biogasM3Day:69.12,methaneM3Day:42.093,electricityKwhDay:151.08};
const alternative={hrtHours:21.5,biogasM3Day:67.6,methaneM3Day:42.24,electricityKwhDay:151.61};
test('a candidate with a falling production output is excluded even when another rises',()=>{
  assert.equal(improvesProduction({...alternative,biogasM3Day:60},current),false);
  assert.equal(improvesProduction({...alternative,electricityKwhDay:140},current),false);
  assert.equal(improvesProduction({...alternative,methaneM3Day:40},current),false);
  assert.equal(improvesProduction(current,current),false);
  assert.equal(improvesProduction(first,current),true);
});
test('repeat selection uses a different complete candidate, respecting the objective within alternatives',()=>{
  const pool=[alternative,first];
  assert.equal(chooseProductionCandidate(pool,'shortest_hrt',null).selected,first);
  assert.equal(chooseProductionCandidate(pool,'shortest_hrt',first).selected,alternative);
  assert.equal(chooseProductionCandidate(pool,'maximum_energy',null).selected,alternative);
  assert.equal(chooseProductionCandidate(pool,'maximum_energy',alternative).selected,first);
  assert.equal(differentDisplayedProduction({...first,hrtHours:19.501,biogasM3Day:69.121},first),false);
});
test('an empty or single valid pool cannot invent an alternative',()=>{
  assert.equal(chooseProductionCandidate([],'shortest_hrt',first).selected,null);
  const one=chooseProductionCandidate([first],'shortest_hrt',first);
  assert.equal(one.selected,first);assert.equal(one.alternativeCount,0);assert.equal(one.changed,false);
});
