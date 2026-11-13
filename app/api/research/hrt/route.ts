import {NextResponse} from "next/server";
import {getSession} from "../../../lib/auth";
import {InputError} from "../../../lib/inputs";
import {researchMetadata,researchRows,type ResearchCalculation} from "../../../lib/hrt-research";
import {executeResearch} from "../../../lib/hrt-research-execution";
import {getEvidence,validRunId,verifyEvidence} from "../../../lib/audit";
import {csvCell,evidenceAuthentication} from "../../../lib/evidence";
import pairedSource from "../../../../ai-workflow/research/paired-200-2026-11-07/source.json";

import {sameTankSource} from "../../../lib/same-tank-model";

export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  const query=new URL(request.url).searchParams,id=query.get("runId");
  if(query.get("view")==="same-tank-data"&&!id){
    if(query.get("format")==="csv")return new Response([sameTankSource.headers,...sameTankSource.rows.map(row=>sameTankSource.headers.map(key=>row[key as keyof typeof row]))].map(row=>row.map(csvCell).join(",")).join("\r\n"),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=aquaivolt-same-tank-500-source-records.csv"}});
    return NextResponse.json({source:sameTankSource.source,headers:sameTankSource.headers,rows:sameTankSource.rows},{headers});
  }
  if(query.get("view")==="paired-data"&&!id)return NextResponse.json({source:researchMetadata().paired.source,headers:pairedSource.headers,rows:pairedSource.rows},{headers});
  if(query.get("view")==="data"&&!id)return NextResponse.json({source:researchMetadata().source,dataHash:researchMetadata().dataHash,rows:researchRows},{headers});
  if(!id)return NextResponse.json(researchMetadata(),{headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
  if(!validRunId(id))return NextResponse.json({error:"Invalid run ID"},{status:400,headers});
  try{
    const record=await getEvidence(id);
    if(!record||record.kind!=="hrt_research")return NextResponse.json({error:"Research record not found"},{status:404,headers});
    if(!verifyEvidence(record))return NextResponse.json({error:"Stored evidence integrity failed"},{status:409,headers});
    if(query.get("format")==="csv"){
      const result=record.response as ResearchCalculation;
      if(result.pairedComparison){
        const pair=result.pairedComparison;
        const columns=["candidate_id","pathway","intervention","hrt_hours","temperature_c","ph","feed_kg_vs_day","olr_kg_vs_m3_day","baseline_biogas_m3_day","predicted_biogas_m3_day","biogas_gain_pct","baseline_methane_m3_day","predicted_methane_m3_day","methane_gain_pct","baseline_electricity_kwh_day","predicted_electricity_kwh_day","electricity_gain_pct","predicted_methane_pct","minimum_gain_pct","all_three_above_40","selected_scenario","input_origin","parent_a","parent_b","weight_b","selection_seed","previous_candidate_id","baseline_basis","baseline_model_version","after_model_version","models_hash","input_pool_hash","source_workbook_sha256","baseline_workbook_sha256","run_id","output_hash","training_rows","evaluated_inputs","validation_status","data_role","authentication_type","record_hash","record_hmac","before_hrt_hours","after_hrt_hours","hrt_change_hours","srt_days","source_sheet","source_parent_a_excel_row","source_parent_b_excel_row","selected_stage","stage_eligible","stage_feed_requirement"];
        const rows=result.candidates.map(point=>{
          if(!point.paired)throw new Error("Missing paired candidate evidence");
          const {input,baseline,gains,minimumGainPct}=point.paired;
          return [input.id,input.pathway,input.intervention,input.hrtHours,input.temperature,input.ph,input.feedRate,input.olr,baseline.biogasM3Day,point.biogasM3Day,gains.biogasM3Day,baseline.methaneM3Day,point.methaneM3Day,gains.methaneM3Day,baseline.electricityKwhDay,point.electricityKwhDay,gains.electricityKwhDay,point.methanePct,minimumGainPct,minimumGainPct>40,input.id===pair.input.id,input.kind,input.parentA,input.parentB,input.weightB,pair.selectionSeed,pair.previousCandidateId,pair.basis,pair.baselineModelVersion,result.modelVersion,result.artifactHash,pair.poolHash,result.source.sha256,pair.baselineSourceHash,id,record.outputHash,pair.trainingRows,pair.evaluatedCount,result.validationStatus,pair.sameTank?"planning_source_before_model_after_not_measured_plant_improvement":"planning_simulation_cross_model_comparison_not_measured_plant_improvement",evidenceAuthentication.type,record.recordHash,record.signature,point.paired.baselineHrtHours??input.hrtHours,input.hrtHours,input.hrtHours-(point.paired.baselineHrtHours??input.hrtHours),input.srtDays??null,result.source.sheet,input.parentA+1,input.parentB+1,pair.sameTank?.stage??null,pair.sameTank?input.pathway===pair.sameTank.stage:null,pair.sameTank?sameTankSource.rows[input.parentA-1]["Feed requirement"]:null];
        });
        return new Response([columns,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n"),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="aquaivolt-${id}-2000-paired-scenarios.csv"`}});
      }
      const columns=["hrt_hours","biogas_m3_day","methane_pct","methane_m3_day","electricity_kwh_day","temperature_c","ph","feed_rate_kg_vs_day","olr_kg_vs_m3_day","source_stability_index_pct","h2s_before_ppm","h2s_after_ppm","baseline_hrt_hours","hrt_change_hours","run_id","model_version","model_hash","dataset_hash","source_workbook_sha256","scenario_mode","scenario_seed","data_role","authentication_type","independently_verifiable","record_hash","record_hmac","baseline_basis","baseline_biogas_m3_day","biogas_gain_pct","workbook_50pct_qualifies","selected_scenario","energy_baseline_hrt_hours","energy_baseline_methane_m3_day","energy_baseline_electricity_kwh_day","energy_methane_gain_pct","energy_electricity_gain_pct","energy_50pct_qualifies","energy_selected_scenario","energy_baseline_basis"];
      const rows=result.candidates.map(p=>[p.hrtHours,p.biogasM3Day,p.methanePct,p.methaneM3Day,p.electricityKwhDay,p.temperature,p.ph,p.feedRate,p.olr,p.stabilityPct,p.h2sBeforePpm,p.h2sAfterPpm,result.retentionTime.beforeHours,result.retentionTime.beforeHours===null?null:p.hrtHours-result.retentionTime.beforeHours,id,result.modelVersion,result.artifactHash,result.dataHash,result.source.sha256,result.scenario?.mode??"manual",result.scenario?.seed??"","synthetic_research_model_evaluation_not_plant_measurement",evidenceAuthentication.type,false,record.recordHash,record.signature,result.workbookBaseline?"workbook_biogas":"modelled_hrt",result.workbookBaseline?.biogasM3Day??result.comparison?.biogasM3Day??null,result.workbookBaseline?(p.biogasM3Day/result.workbookBaseline.biogasM3Day-1)*100:null,result.workbookBaseline?p.biogasM3Day>=result.workbookBaseline.biogasM3Day*1.5:null,p.hrtHours===result.selected.hrtHours,result.energyComparison?.baseline.hrtHours,result.energyComparison?.baseline.methaneM3Day,result.energyComparison?.baseline.electricityKwhDay,result.energyComparison?(p.methaneM3Day/result.energyComparison.baseline.methaneM3Day-1)*100:null,result.energyComparison?(p.electricityKwhDay/result.energyComparison.baseline.electricityKwhDay-1)*100:null,result.energyComparison?p.methaneM3Day>=result.energyComparison.baseline.methaneM3Day*1.5&&p.electricityKwhDay>=result.energyComparison.baseline.electricityKwhDay*1.5:null,result.energyComparison?p.hrtHours===result.energyComparison.selected.hrtHours:null,result.energyComparison?.basis]);
      return new Response([columns,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n"),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="aquaivolt-${id}-hrt-research.csv"`}});
    }
    return NextResponse.json({...record.response as object,audit:{saved:true,status:"RECORDED",recordHash:record.recordHash},integrity:true,authentication:evidenceAuthentication},{headers});
  }catch{return NextResponse.json({error:"Research evidence could not be read"},{status:503,headers});}
}
export async function POST(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required to record research runs"},{status:403,headers});
  let body:unknown;
  try{const raw=await request.text();if(raw.length>4000)return NextResponse.json({error:"Request too large"},{status:413,headers});body=JSON.parse(raw);}catch{return NextResponse.json({error:"Valid JSON is required"},{status:400,headers});}
  try{return NextResponse.json(await executeResearch(body,session),{headers});}
  catch(error){if(error instanceof InputError)return NextResponse.json({error:error.message,issues:error.issues},{status:422,headers});console.error("Hours research execution failed",error instanceof Error?error.message:"Unknown error");return NextResponse.json({error:"Research model could not complete this run"},{status:500,headers});}
}
