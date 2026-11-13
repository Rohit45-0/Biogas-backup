import model from "../../ai-workflow/research/same-tank-500-2026-11-10/model.json";
import source from "../../ai-workflow/research/same-tank-500-2026-11-10/source.json";
import pool from "../../ai-workflow/research/same-tank-500-2026-11-10/inputs.json";
import {fingerprint} from "./evidence";
import {productionKeys,type PairedInput,type ProductionValues} from "./paired-scenarios";

export const sameTankModel=model;
export const sameTankSource=source;
export const sameTankInputs=pool.rows;
export const sameTankIdentity={artifactHash:fingerprint(model),dataHash:fingerprint({source,pool})};
export const sameTankPoolHash=fingerprint(pool);
export function sourceBefore(scenario:number){
  const row=source.rows[scenario-1];
  if(!row||row.Scenario!==scenario)throw new Error("Same-tank source row is unavailable");
  return {hrtHours:row["BEFORE HRT (h)"],biogasM3Day:row["BEFORE Biogas (m3/d)"],methanePct:row["BEFORE CH4 (%)"],methaneM3Day:row["BEFORE Methane (m3/d)"],electricityKwhDay:row["BEFORE Electricity (kWh/d)"]};
}
export function predictSameTank(input:typeof pool.rows[number]){
  const stage=model.stageInfo.find(s=>s.id===input.stage);
  if(!stage||input.values.length!==4||input.values.some((v,i)=>!Number.isFinite(v)||v<stage.min[i]-1e-8||v>stage.max[i]+1e-8))throw new Error("Inputs outside this stage's supported source coverage");
  const features=[...model.stages.map(s=>s===input.stage?1:0),...input.values.map((v,i)=>(v-model.mean[i])/model.scale[i])];
  const [biogasM3Day,methanePct]=model.coefficients.map((weights,i)=>weights.reduce((sum,w,j)=>sum+w*features[j],model.intercept[i]));
  if(!(biogasM3Day>0&&methanePct>0&&methanePct<100))throw new Error("Unsupported same-tank prediction");
  const methaneM3Day=biogasM3Day*methanePct/100;
  return {biogasM3Day,methanePct,methaneM3Day,electricityKwhDay:methaneM3Day*9.97*.36};
}
export function evaluateSameTank(){
  return pool.rows.map(candidate=>{
    const stage=model.stageInfo.find(s=>s.id===candidate.stage)!;
    const a=source.rows[candidate.parentA-1],b=source.rows[candidate.parentB-1];
    const baseline=sourceBefore(candidate.parentA),other=sourceBefore(candidate.parentB);
    if(a.Stage!==candidate.stage||b.Stage!==candidate.stage||JSON.stringify(baseline)!==JSON.stringify(other))throw new Error("Generated candidate has incompatible source parents");
    const prediction=predictSameTank(candidate);
    const input:PairedInput={id:candidate.id,pathway:candidate.stage,intervention:stage.label,hrtHours:candidate.values[0],temperature:candidate.values[1],ph:candidate.values[2],srtDays:candidate.values[3],feedRate:null,olr:null,kind:"same_stage_interpolation",parentA:candidate.parentA,parentB:candidate.parentB,weightB:candidate.weightB};
    const gains=Object.fromEntries(productionKeys.map(key=>[key,(prediction[key]/baseline[key]-1)*100])) as ProductionValues;
    return {input,baseline,prediction,gains,minimumGainPct:Math.min(...Object.values(gains))};
  });
}
export function chooseSameTank(seed:string,stageId:string,previousId?:string){
  const evaluations=evaluateSameTank();
  const ranked=evaluations.filter(row=>row.input.pathway===stageId&&row.input.hrtHours<row.baseline.hrtHours).sort((a,b)=>b.minimumGainPct-a.minimumGainPct||a.input.hrtHours-b.input.hrtHours);
  if(!ranked.length)throw new Error("No supported candidate for the selected same-tank stage");
  const qualifying=ranked.filter(row=>row.minimumGainPct>40);
  const alternatives=qualifying.filter(row=>row.input.id!==previousId);
  const choices=alternatives.length?alternatives:qualifying;
  const sample=parseInt(fingerprint({seed,stageId,previousId:previousId??null,pool:sameTankPoolHash}).slice(7,15),16)/0x100000000;
  return {evaluations,ranked,qualifying,selected:choices.length?choices[Math.floor(sample*choices.length)]:ranked[0],alternativeCount:alternatives.length};
}
