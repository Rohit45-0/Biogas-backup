import model from "../../ai-workflow/research/paired-200-2026-11-07/model.json";
import pool from "../../ai-workflow/research/paired-200-2026-11-07/inputs.json";
import {fingerprint} from "./evidence";

export const pairedModel=model;
export const pairedModelHash=fingerprint(model);
export const pairedPoolHash=fingerprint(pool);
export const productionKeys=["biogasM3Day","methaneM3Day","electricityKwhDay"] as const;
export type ProductionValues=Record<typeof productionKeys[number],number>;
export type PairedInput={id:string;pathway:string;intervention:string;hrtHours:number;temperature:number;ph:number;feedRate:number|null;olr:number|null;kind:string;parentA:number;parentB:number;weightB:number;srtDays?:number};
export type PairedCandidateEvidence={input:PairedInput;baseline:ProductionValues;gains:ProductionValues;minimumGainPct:number;baselineHrtHours?:number};
export type PairedComparison={
  basis:"EXPLORATORY_CROSS_MODEL_SAME_HRT"|"SOURCE_BEFORE_SAME_TANK_MODEL_AFTER";input:PairedInput;gains:ProductionValues;
  minimumGainPct:number;thresholdPct:number;thresholdMet:boolean;qualifyingCount:number;
  evaluatedCount:number;trainingRows:number;selectionSeed:string;previousCandidateId:string|null;
  poolHash:string;baselineModelVersion:string;baselineSourceHash:string;
  validation:typeof model.holdout;meaning:string;
  sameTank?:{stage:string;stageLabel:string;added:string;feedRequirements:string[];sourceVerdicts:string[];baselineHrtHours:number;baselineSourceRow:number;sourceAfterHrtHours:number;sourceAfter:ProductionValues;sourceFile:string;sourceSheet:string;sourceHash:string;coverageMin:number;coverageMax:number};
};

export const pairedInputs:PairedInput[]=pool.rows.map(row=>({
  id:String(row[0]),pathway:String(row[1]),intervention:String(row[2]),hrtHours:Number(row[3]),temperature:Number(row[4]),ph:Number(row[5]),feedRate:Number(row[6]),olr:Number(row[7]),kind:String(row[8]),parentA:Number(row[9]),parentB:Number(row[10]),weightB:Number(row[11]),
}));
if(pairedInputs.length!==2000||new Set(pairedInputs.map(input=>input.id)).size!==2000)throw new Error("Invalid paired scenario input pool");

/** Exact dense one-hot + StandardScaler + fitted Ridge pipeline exported from Python. */
export function predictPaired(input:PairedInput){
  if(!model.pathways.includes(input.pathway))throw new Error("Unsupported pathway");
  if(input.feedRate===null||input.olr===null)throw new Error("Paired model requires feed and loading");
  const numeric=[input.hrtHours,input.temperature,input.ph,input.feedRate,input.olr];
  if(!numeric.every(Number.isFinite)||input.hrtHours<2||input.hrtHours>24)throw new Error("Invalid or unsupported paired model inputs");
  const features=[...model.pathways.map(pathway=>pathway===input.pathway?1:0),...numeric.map((value,i)=>(value-model.mean[i])/model.scale[i])];
  const [biogasM3Day,methanePct]=model.coefficients.map((weights,i)=>weights.reduce((sum,weight,j)=>sum+weight*features[j],model.intercept[i]));
  if(!Number.isFinite(biogasM3Day)||biogasM3Day<=0||!Number.isFinite(methanePct)||methanePct<=0||methanePct>=100)throw new Error("Paired model returned unsupported production");
  const methaneM3Day=biogasM3Day*methanePct/100;
  return {biogasM3Day,methanePct,methaneM3Day,electricityKwhDay:methaneM3Day*9.97*.36};
}

export function evaluatePairedScenarios(baselineAt:(hours:number)=>ProductionValues){
  return pairedInputs.map(input=>{
    const baseline=baselineAt(input.hrtHours),prediction=predictPaired(input);
    if(productionKeys.some(key=>!Number.isFinite(baseline[key])||baseline[key]<=0))throw new Error("Paired baseline is unavailable");
    const gains=Object.fromEntries(productionKeys.map(key=>[key,(prediction[key]/baseline[key]-1)*100])) as ProductionValues;
    return {input,baseline:Object.fromEntries(productionKeys.map(key=>[key,baseline[key]])) as ProductionValues,prediction,gains,minimumGainPct:Math.min(...Object.values(gains))};
  });
}
export type PairedEvaluation=ReturnType<typeof evaluatePairedScenarios>[number];

/** Randomize the input selection, never the predictions. Saved seeds replay exactly. */
export function selectPairedScenario(evaluations:PairedEvaluation[],seed:string,previousId?:string){
  if(!evaluations.length)throw new Error("No candidate inputs are available");
  const ranked=[...evaluations].sort((a,b)=>b.minimumGainPct-a.minimumGainPct||a.input.id.localeCompare(b.input.id));
  const qualifying=ranked.filter(point=>point.minimumGainPct>40);
  const previous=evaluations.find(point=>point.input.id===previousId);
  const different=qualifying.filter(point=>point.input.id!==previousId);
  // Prefer distinct visible baseline/prediction pairs when the eligible pool permits it.
  const visiblyDifferent=previous?different.filter(point=>productionKeys.every(key=>Math.round(point.baseline[key]*100)!==Math.round(previous.baseline[key]*100)&&Math.round(point.prediction[key]*100)!==Math.round(previous.prediction[key]*100))):different;
  const choices=visiblyDifferent.length?visiblyDifferent:different.length?different:qualifying;
  const random=parseInt(fingerprint({generator:"paired-scenario-selection-v1",seed,poolHash:pairedPoolHash,previousId:previousId??null}).slice(7,15),16)/0x100000000;
  return {selected:choices.length?choices[Math.floor(random*choices.length)]:ranked[0],qualifying,ranked,alternativeCount:different.length};
}
