import {calculateReactorSearch,reactorSearchOutputHash,type ReactorSearchCalculation} from "./reactor-search";
import {reactorDataHash,reactorModelHash,reactorProductionKeys,sourceBeforeBaseline} from "./reactor-optimization";
import {generatedInputIsTraceable,reactorInputKey,reactorSourceById,type GeneratedReactorInput} from "./reactor-scenario-generator";
import {reactorSourceRecord} from "./reactor-source-reference";
import {fingerprint,csvCell} from "./evidence";
import {getEvidence,storeEvidence,verifyEvidence,storageProvider} from "./audit";
import type {AquaSession} from "./auth";
import build from "./reactor-search-build.json";

export async function executeReactorSearch(body:unknown,session:AquaSession){
 const raw=body&&typeof body==="object"&&!Array.isArray(body)?body as Record<string,unknown>:{};
 const effective={...raw,generationSeed:raw.method==="model"?(raw.generationSeed??crypto.randomUUID()):null};
 const started=performance.now(),calculation=calculateReactorSearch(effective);
 const response={...calculation,runId:crypto.randomUUID(),createdAt:new Date().toISOString(),outputHash:reactorSearchOutputHash(calculation),manifestHash:build.sourceHash,elapsedMs:performance.now()-started};
 try{const record=await storeEvidence({id:response.runId,createdAt:response.createdAt,username:session.username,role:session.role,kind:"reactor_search",request:body,inputs:calculation.request,response,modelVersion:calculation.modelVersion,manifestHash:build.sourceHash,requestHash:fingerprint(body),inputsHash:fingerprint(calculation.request),responseHash:fingerprint(response),outputHash:response.outputHash});return {...response,audit:{saved:true,provider:storageProvider(),recordHash:record.recordHash}};}
 catch{return {...response,audit:{saved:false,provider:storageProvider(),recordHash:null}};}
}
export type ReactorSearchResult=Awaited<ReturnType<typeof executeReactorSearch>>;
export async function verifyReactorSearch(id:string){
 const record=await getEvidence(id);if(!record||record.kind!=="reactor_search")return {http:404,data:{error:"Generated reactor study record not found"}};
 if(!verifyEvidence(record))return {http:409,data:{error:"Stored evidence integrity failed"}};
 const saved=record.response as ReactorSearchResult;
 if(saved.dataHash!==reactorDataHash||saved.modelHash!==reactorModelHash||record.manifestHash!==build.sourceHash)return {http:409,data:{error:"This record belongs to an earlier source, model or generator version. Its original evidence remains available."}};
 const replay=calculateReactorSearch(record.inputs),generated=saved.generatedCandidateCount>0;
 const checks=[{name:"Server HMAC and SHA-256 integrity",passed:true},{name:"Saved output and candidate hash",passed:reactorSearchOutputHash(saved)===record.outputHash&&saved.outputHash===record.outputHash},{name:"Seeded generation, model inference and selection replay",passed:reactorSearchOutputHash(replay)===record.outputHash},{name:"Model, source and engine identities",passed:saved.dataHash===reactorDataHash&&saved.modelHash===reactorModelHash&&saved.manifestHash===build.sourceHash},{name:"Distinct generated inputs and source-parent lineage",passed:!generated||saved.candidateCount===2000&&saved.generatedCandidateCount===2000&&saved.candidates.length===2000&&new Set(saved.candidates.map(reactorInputKey)).size===2000&&saved.candidates.every(c=>"kind" in c.provenance&&c.provenance.kind==="generated"&&generatedInputIsTraceable(c as GeneratedReactorInput))},{name:"Same-reactor baseline and selection configuration",passed:saved.request.mode!=="same_reactor"||!saved.selected||saved.selected.pathway===saved.baseline.pathway&&saved.selected.configuration===saved.baseline.configuration}];
 if(saved.request.mode==="source_baseline"){checks.push({name:"BEFORE columns and source provenance",passed:fingerprint(saved.baseline)===fingerprint(sourceBeforeBaseline(saved.request.technology))});if(saved.request.method==="source")checks.push({name:"Exact AFTER HRT and production columns",passed:saved.candidates.every(c=>{const row=reactorSourceRecord(c.id);return c.hrtHours===row.hrtHours&&fingerprint(c.outputs)===fingerprint(row.after);})});}
 const passed=checks.every(c=>c.passed);return {http:passed?200:409,data:{status:passed?"PASS":"FAIL",runId:id,checks,meaning:"Software integrity, source lineage and reproducibility; not proof of plant accuracy or realized benefit."}};
}

function sourceReferenceCells(r:{baseline:{sourceReference?:{file:string;sheet:string;row:number;sha256:string;beforeHrtColumn:string;afterHrtColumn:string;hrtUnit:string}}}){const s=r.baseline.sourceReference;return s?[s.file,s.sheet,s.row,s.sha256,s.beforeHrtColumn,s.afterHrtColumn,s.hrtUnit]:[null,null,null,null,null,null,"hours"];}

type ExportResult=ReactorSearchCalculation&{runId:string;outputHash:string};
export function reactorSearchCsv(r:ExportResult){
 const header=["candidate_id","pathway","technology","configuration","candidate_kind","parent_a_id","parent_b_id","weight_b","parent_a_file","parent_a_sheet","parent_a_row","parent_a_sha256","parent_b_file","parent_b_sheet","parent_b_row","parent_b_sha256","study_mode","calculation_method","baseline_origin","baseline_scenario_id","before_hrt_h","after_hrt_h","hrt_change_h","hrt_reduction_pct","before_biogas_m3_day","after_biogas_m3_day","biogas_gain_pct","before_methane_m3_day","after_methane_m3_day","methane_gain_pct","before_electricity_kwh_day","after_electricity_kwh_day","electricity_gain_pct","srt_days","temperature_c","ph","upflow_m_h","olr","olr_basis","methane_pct","eligible","selected","exclusion_reasons","training_records","evaluated_candidates","generation_seed","generator_version","pool_hash","model_version","model_hash","data_hash","run_id","output_hash","before_source_file","before_source_sheet","before_source_row","before_source_sha256","before_hrt_column","after_hrt_column","hrt_unit"];
 const rows=r.candidates.map(c=>{
  const lineage=c.provenance,generated="parentAId" in lineage,a=generated?reactorSourceById(lineage.parentAId):reactorSourceById(c.id),b=generated?reactorSourceById(lineage.parentBId):undefined;
  const provenance=(p:typeof a)=>p?[p.provenance.file,p.provenance.sheet,p.provenance.row,p.provenance.sha256]:[null,null,null,null];
  return [c.id,c.pathway,c.technology,c.configuration,generated?"MODEL_GENERATED":"SOURCE_RECORD",a?.id??null,b?.id??null,generated?lineage.weightB:null,...provenance(a),...provenance(b),r.request.mode,r.method,r.baseline.origin,r.baseline.scenarioId,c.comparable?r.baseline.hrtHours:null,c.hrtHours,c.comparable?c.hrtHours-r.baseline.hrtHours:null,c.hrtReductionPct,...reactorProductionKeys.flatMap(key=>[c.comparable?r.baseline[key]:null,c.outputs[key],c.gains[key]]),c.srtDays,c.temperatureC,c.ph,c.upflowMHour,c.olr,c.olrBasis,c.outputs.methanePct,c.eligible,c.id===r.selected?.id,c.reasons.join("; "),r.trainingSourceCount,r.candidateCount,r.generation.seed,r.generation.version,r.generation.poolHash,r.modelVersion,r.modelHash,r.dataHash,r.runId,r.outputHash,...sourceReferenceCells(r)];
 });
 return [header,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n");
}
export function reactorSearchKpiCsv(r:ExportResult){
 const s=r.selected,rows:unknown[][]=[["HRT","h",r.baseline.hrtHours,s?.hrtHours??null,s?s.hrtHours-r.baseline.hrtHours:null,s?-s.hrtReductionPct!:null]];
 for(const days of [1,365])for(const key of reactorProductionKeys){const before=r.baseline[key],after=s?.outputs[key]??null;rows.push([key,key==="electricityKwhDay"?`kWh/${days===1?"day":"year"}`:`m3${key==="methaneM3Day"?" CH4":""}/${days===1?"day":"year"}`,before===null?null:before*days,after===null?null:after*days,before===null||after===null?null:(after-before)*days,s?.gains[key]??null]);}
 const header=["metric","unit","before","after","absolute_change","change_pct","reactor_before","reactor_after","baseline_scenario_id","selected_candidate_id","status","training_records","evaluated_candidates","generated_candidates","generation_seed","generator_version","pool_hash","model_version","model_hash","run_id","output_hash","before_source_file","before_source_sheet","before_source_row","before_source_sha256","before_hrt_column","after_hrt_column","hrt_unit"];
 return [header,...rows.map(row=>[...row,r.baseline.technology,s?.technology??null,r.baseline.scenarioId,s?.id??null,r.status,r.trainingSourceCount,r.candidateCount,r.generatedCandidateCount,r.generation.seed,r.generation.version,r.generation.poolHash,r.modelVersion,r.modelHash,r.runId,r.outputHash,...sourceReferenceCells(r)])].map(row=>row.map(csvCell).join(",")).join("\r\n");
}
