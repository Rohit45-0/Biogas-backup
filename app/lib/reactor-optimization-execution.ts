import {calculateReactorStudy,reactorDataHash,reactorModelHash,reactorOutputHash,reactorProductionKeys,type ReactorCalculation} from "./reactor-optimization";
import {fingerprint,csvCell} from "./evidence";
import {getEvidence,storeEvidence,verifyEvidence,storageProvider} from "./audit";
import type {AquaSession} from "./auth";
import build from "./reactor-optimization-build.json";

export async function executeReactorStudy(body:unknown,session:AquaSession){
  const started=performance.now(),calculation=calculateReactorStudy(body);
  const response={...calculation,runId:crypto.randomUUID(),createdAt:new Date().toISOString(),outputHash:reactorOutputHash(calculation),manifestHash:build.sourceHash,elapsedMs:performance.now()-started};
  try{const record=await storeEvidence({id:response.runId,createdAt:response.createdAt,username:session.username,role:session.role,kind:"reactor_optimization",request:body,inputs:calculation.request,response,modelVersion:calculation.modelVersion,manifestHash:build.sourceHash,requestHash:fingerprint(body),inputsHash:fingerprint(calculation.request),responseHash:fingerprint(response),outputHash:response.outputHash});return {...response,audit:{saved:true,provider:storageProvider(),recordHash:record.recordHash}};}
  catch{return {...response,audit:{saved:false,provider:storageProvider(),recordHash:null}};}
}
export type ReactorResult=Awaited<ReturnType<typeof executeReactorStudy>>;
export async function verifyReactorStudy(id:string){
  const record=await getEvidence(id);
  if(!record||record.kind!=="reactor_optimization")return {http:404,data:{error:"Reactor study record not found"}};
  if(!verifyEvidence(record))return {http:409,data:{error:"Stored evidence integrity failed"}};
  const saved=record.response as ReactorResult;
  if(saved.dataHash!==reactorDataHash||saved.modelHash!==reactorModelHash||record.manifestHash!==build.sourceHash)return {http:409,data:{error:"This run belongs to another dataset or model version. Its original evidence remains available."}};
  const replay=calculateReactorStudy(record.inputs);
  const checks=[{name:"Server HMAC and SHA-256 integrity",passed:true},
    {name:"Saved calculation hash",passed:reactorOutputHash(saved)===record.outputHash&&saved.outputHash===record.outputHash},
    {name:"Deterministic model and selection replay",passed:reactorOutputHash(replay)===record.outputHash},
    {name:"Source, fitted model and engine identities",passed:saved.dataHash===reactorDataHash&&saved.modelHash===reactorModelHash&&saved.manifestHash===build.sourceHash},
    {name:"Same-reactor baseline and selected configuration",passed:saved.request.mode!=="same_reactor"||!saved.selected||saved.selected.pathway===saved.baseline.pathway&&saved.selected.configuration===saved.baseline.configuration},
    {name:"Candidate count and unique source IDs",passed:saved.candidateCount===400&&saved.candidates.length===400&&new Set(saved.candidates.map(row=>row.id)).size===400}];
  const passed=checks.every(check=>check.passed);
  return {http:passed?200:409,data:{status:passed?"PASS":"FAIL",runId:id,checks,meaning:"Software integrity and reproducibility. This does not verify plant accuracy or prove an AI-caused production gain."}};
}
type ExportResult=ReactorCalculation&{runId:string;outputHash:string};
export function reactorScenarioCsv(result:ExportResult){
  const header=["scenario_id","pathway","technology","configuration","source_file","source_sheet","source_row","source_sha256","study_mode","calculation_method","baseline_origin","baseline_scenario_id","baseline_pathway","before_hrt_h","after_hrt_h","hrt_change_h","hrt_reduction_pct","before_biogas_m3_day","after_biogas_m3_day","biogas_gain_pct","before_methane_m3_day","after_methane_m3_day","methane_gain_pct","before_electricity_kwh_day","after_electricity_kwh_day","electricity_gain_pct","before_electricity_kwh_year","after_electricity_kwh_year","source_biogas_m3_day","source_methane_pct","source_electricity_kwh_day","srt_days","temperature_c","ph","upflow_m_h","olr","olr_basis","comparable","eligible","selected","exclusion_reasons","model_version","data_hash","model_hash","run_id","output_hash"];
  const rows=result.candidates.map(row=>[row.id,row.pathway,row.technology,row.configuration,row.provenance.file,row.provenance.sheet,row.provenance.row,row.provenance.sha256,result.request.mode,result.method,result.baseline.origin,result.baseline.scenarioId,result.baseline.pathway,row.comparable?result.baseline.hrtHours:null,row.hrtHours,row.comparable?row.hrtHours-result.baseline.hrtHours:null,row.hrtReductionPct,...reactorProductionKeys.flatMap(key=>[row.comparable?result.baseline[key]:null,row.outputs[key],row.gains[key]]),row.comparable?result.annual.baseline.electricityKwhDay:null,row.outputs.electricityKwhDay*365,row.sourceOutputs.biogasM3Day,row.sourceOutputs.methanePct,row.sourceOutputs.electricityKwhDay,row.srtDays,row.temperatureC,row.ph,row.upflowMHour,row.olr,row.olrBasis,row.comparable,row.eligible,row.id===result.selected?.id,row.reasons.join("; "),result.modelVersion,result.dataHash,result.modelHash,result.runId,result.outputHash]);
  return [header,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n");
}
export function reactorKpiCsv(result:ExportResult){
  const selected=result.selected;
  const rows:unknown[][]=[["HRT","h",result.baseline.hrtHours,selected?.hrtHours??null,selected?selected.hrtHours-result.baseline.hrtHours:null,selected?-selected.hrtReductionPct!:null]];
  for(const days of [1,365])for(const key of reactorProductionKeys){const before=result.baseline[key],after=selected?.outputs[key]??null;rows.push([key,key==="electricityKwhDay"?`kWh/${days===1?"day":"year"}`:`m3${key==="methaneM3Day"?" CH4":""}/${days===1?"day":"year"}`,before===null?null:before*days,after===null?null:after*days,before===null||after===null?null:(after-before)*days,selected?.gains[key]??null]);}
  const header=["metric","unit","before","after","absolute_change","change_pct","study_mode","calculation_method","reactor_before","reactor_after","baseline_origin","baseline_scenario_id","selected_scenario_id","status","source_record_count","eligible_count","model_version","data_hash","model_hash","run_id","output_hash"];
  return [header,...rows.map(row=>[...row,result.request.mode,result.method,result.baseline.technology,selected?.technology??null,result.baseline.origin,result.baseline.scenarioId,selected?.id??null,result.status,result.candidateCount,result.eligibleCount,result.modelVersion,result.dataHash,result.modelHash,result.runId,result.outputHash])].map(row=>row.map(csvCell).join(",")).join("\r\n");
}
