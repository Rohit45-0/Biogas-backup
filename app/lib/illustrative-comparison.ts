export type DemoBaseline={biogasM3Day:number;methaneM3Day:number;electricityKwhDay:number;hrtHours:number};

// Presentation-only arithmetic. Never used by prediction, selection, persistence,
// verification, exports, or the model-result integrity checks.
export function illustrativeComparison(baseline:DemoBaseline|null,runId:string){
  const keys=["biogasM3Day","methaneM3Day","electricityKwhDay"] as const;
  if(!baseline||!runId||!Number.isFinite(baseline.hrtHours)||keys.some(key=>!Number.isFinite(baseline[key])||baseline[key]<=0))return null;
  // The random server run ID seeds one stable presentation sample. Revisiting
  // charts/history must not resample a run or attach new values to its evidence.
  let seed=2166136261;
  for(const character of runId)seed=Math.imul(seed^character.charCodeAt(0),16777619)>>>0;
  const assumedGainPct=5+(seed%501)/100,factor=1+assumedGainPct/100;
  return {kind:"ILLUSTRATIVE_DEMO" as const,assumedGainPct,baseline:{...baseline},
    illustrative:{biogasM3Day:baseline.biogasM3Day*factor,methaneM3Day:baseline.methaneM3Day*factor,electricityKwhDay:baseline.electricityKwhDay*factor}};
}
