import {calculateHrtStudy,hrtStudyDataHash,hrtStudyOutputHash,type HrtStudyCalculation} from "./hrt-optimization";
import {fingerprint,csvCell} from "./evidence";
import {getEvidence,storeEvidence,verifyEvidence,storageProvider} from "./audit";
import type {AquaSession} from "./auth";
import build from "./hrt-optimization-build.json";

export async function executeHrtStudy(body:unknown,session:AquaSession){
  const started=performance.now(),calculation=calculateHrtStudy(body);
  const response={...calculation,runId:crypto.randomUUID(),createdAt:new Date().toISOString(),
    outputHash:hrtStudyOutputHash(calculation),manifestHash:build.sourceHash,elapsedMs:performance.now()-started};
  try{
    const record=await storeEvidence({id:response.runId,createdAt:response.createdAt,username:session.username,role:session.role,
      kind:"hrt_optimization",request:body,inputs:calculation.request,response,modelVersion:calculation.version,
      manifestHash:build.sourceHash,requestHash:fingerprint(body),inputsHash:fingerprint(calculation.request),
      responseHash:fingerprint(response),outputHash:response.outputHash});
    return {...response,audit:{saved:true,provider:storageProvider(),recordHash:record.recordHash}};
  }catch{return {...response,audit:{saved:false,provider:storageProvider(),recordHash:null}};}
}
export type HrtStudyResult=Awaited<ReturnType<typeof executeHrtStudy>>;

export async function verifyHrtStudy(id:string){
  const record=await getEvidence(id);
  if(!record||record.kind!=="hrt_optimization")return {http:404,data:{error:"HRT optimization record not found"}};
  if(!verifyEvidence(record))return {http:409,data:{error:"Stored evidence integrity failed"}};
  const saved=record.response as HrtStudyResult;
  if(saved.dataHash!==hrtStudyDataHash||record.manifestHash!==build.sourceHash)return {http:409,data:{error:"This run belongs to another source or engine version. Download its original evidence."}};
  const replay=calculateHrtStudy(record.inputs);
  const checks=[{name:"Server HMAC and SHA-256 integrity",passed:true},
    {name:"Saved output hash",passed:hrtStudyOutputHash(saved)===record.outputHash&&saved.outputHash===record.outputHash},
    {name:"Deterministic source-scenario replay",passed:hrtStudyOutputHash(replay)===record.outputHash},
    {name:"Source dataset and engine match",passed:saved.dataHash===hrtStudyDataHash&&saved.manifestHash===build.sourceHash}];
  const passed=checks.every(check=>check.passed);
  return {http:passed?200:409,data:{status:passed?"PASS":"FAIL",runId:id,checks,meaning:"Software integrity and replay; not independent plant validation."}};
}

export function hrtStudyCsv(result:HrtStudyCalculation&{runId:string;outputHash:string}){
  const header=["scenario_id","pathway","technology","source_sheet","source_row","baseline_origin","baseline_hrt_h","after_hrt_h","hrt_change_h","hrt_reduction_pct","srt_days","temperature_c","ph","upflow_m_h","olr","olr_basis","before_biogas_m3_day","after_biogas_m3_day","biogas_gain_pct","before_methane_m3_day","after_methane_m3_day","methane_gain_pct","before_electricity_kwh_day","after_electricity_kwh_day","electricity_gain_pct","before_electricity_kwh_year","after_electricity_kwh_year","eligible","selected","exclusion_reasons","data_role","source_sha256","engine_version","data_hash","run_id","output_hash"];
  return [header,...result.candidates.map(row=>[row.id,row.pathway,row.technology,row.provenance.sheet,row.provenance.row,result.baseline.origin,result.baseline.hrtHours,row.hrtHours,row.hrtHours-result.baseline.hrtHours,row.hrtReductionPct,row.srtDays,row.temperatureC,row.ph,row.upflowMHour,row.olr,row.olrBasis,result.baseline.biogasM3Day,row.outputs.biogasM3Day,row.gains.biogasM3Day,result.baseline.methaneM3Day,row.outputs.methaneM3Day,row.gains.methaneM3Day,result.baseline.electricityKwhDay,row.outputs.electricityKwhDay,row.gains.electricityKwhDay,result.annual.baseline.electricityKwhDay,row.outputs.electricityKwhDay*365,row.eligible,row.id===result.selected?.id,row.reasons.join("; "),"WORKBOOK_PLANNING_SIMULATION",result.source.sha256,result.version,result.dataHash,result.runId,result.outputHash])].map(row=>row.map(csvCell).join(",")).join("\r\n");
}
