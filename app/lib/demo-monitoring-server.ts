import {randomUUID} from "node:crypto";
import {getEvidence,storeEvidence,verifyEvidence,type EvidenceRecord} from "./audit";
import {fingerprint} from "./evidence";
import {advance,assessment,crossingCounts,DEMO_VERSION,CURRENT_MONITORING_VERSION,monitoringSource,expectedCrossings,demoReadings,demoRules,engineeringBaseline,classify,type Snapshot,type Command} from "./demo-monitoring";
import type {AquaSession} from "./auth";

export const demoSourceHash=fingerprint(demoReadings);
export const monitoringSourceHash=(version=CURRENT_MONITORING_VERSION)=>fingerprint(monitoringSource(version).rows);
export class DemoError extends Error {constructor(message:string,public status=422){super(message);}}
export async function loadSnapshot(id:string){
 const record=await getEvidence(id);
 if(!record||record.kind!=="demo_monitoring")throw new DemoError("Monitoring record not found.",404);
 if(!verifyEvidence(record))throw new DemoError("Monitoring record integrity failed.",409);
 monitoringSource((record.response as Snapshot).version);
 return {record,snapshot:record.response as Snapshot};
}
export async function saveDemo(kind:EvidenceRecord["kind"],id:string,at:string,session:AquaSession,request:unknown,inputs:unknown,response:unknown,version=CURRENT_MONITORING_VERSION){
 return storeEvidence({id,createdAt:at,username:session.username,role:session.role,kind,request,inputs,response,modelVersion:version,manifestHash:monitoringSourceHash(version),requestHash:fingerprint(request),inputsHash:fingerprint(inputs),responseHash:fingerprint(response),outputHash:fingerprint(response)});
}
export async function executeDemo(parentId:string|null,command:Command,session:AquaSession){
 const parent=command.action==="start"?null:parentId?(await loadSnapshot(parentId)).snapshot:null;
 const id=randomUUID(),at=new Date().toISOString();
 const snapshot=advance(parent,command,id,at,session.username,parent?.version??CURRENT_MONITORING_VERSION),sourceHash=monitoringSourceHash(snapshot.version);
 const record=await saveDemo("demo_monitoring",id,at,session,{parentId:parent?.id??null,command},{sourceHash,rulesHash:fingerprint(snapshot.rules)},snapshot,snapshot.version);
 return {snapshot,source:monitoringSource(snapshot.version).metadata,assessment:assessment(snapshot),baseline:engineeringBaseline(snapshot.reading),audit:{saved:true,recordHash:record.recordHash,sourceHash,thresholdHash:fingerprint(snapshot.rules)}};
}
export async function verifyDemo(id:string,session:AquaSession){
 const {record,snapshot}=await loadSnapshot(id);
 const request=record.request as {parentId:string|null;command:Command};
 const parent=request.parentId?(await loadSnapshot(request.parentId)).snapshot:null;
 const replay=advance(parent,request.command,id,snapshot.createdAt,snapshot.actor,snapshot.version);
 const selectedSource=monitoringSource(snapshot.version),sourceHash=monitoringSourceHash(snapshot.version),expected=expectedCrossings(snapshot.version);
 const checks=[
  {name:"Server authentication and content hashes",passed:verifyEvidence(record)},
  {name:"Reference source data hash matches",passed:record.manifestHash===sourceHash},
  {name:"Threshold settings hash matches",passed:(record.inputs as {rulesHash:string}).rulesHash===fingerprint(snapshot.rules)},
  {name:"Saved command reproduces snapshot and alarm transitions",passed:fingerprint(replay)===fingerprint(snapshot)},
  {name:"Warning and critical boundaries on all 13 rules",passed:demoRules.every(r=>classify(r.warning,r)==="warning"&&classify(r.critical,r)==="critical"&&classify(null,r)==="unknown")},
  {name:`${selectedSource.rows.length} source readings reproduce reported crossing counts`,passed:crossingCounts(selectedSource.rows).every(r=>r.warning===expected[r.id].warning&&r.critical===expected[r.id].critical)},
  {name:"Critical H2S holds explicitly monitored runs and normal fixture recovers",passed:(()=>{const critical=advance(null,{action:"start"},"test",snapshot.createdAt,"test");const raised=advance(critical,{action:"fixture",fixture:"h2s-critical"},"test2",snapshot.createdAt,"test");const recovery=advance(raised,{action:"fixture",fixture:"normal"},"test3",snapshot.createdAt,"test");return assessment(raised).hold&&!assessment(recovery).hold&&recovery.alarms.some(a=>a.ruleId==="h2sHigh"&&a.resolvedAt);})()},
  {name:"Missing and stale readings hold explicitly monitored runs",passed:["missing","stale"].every(f=>assessment(advance(snapshot,{action:"fixture",fixture:f},"test",snapshot.createdAt,"test")).hold)},
  {name:"First-row engineering baseline matches the selected source",passed:snapshot.version===DEMO_VERSION?Math.abs(engineeringBaseline(demoReadings[0])!.biogasNm3Day-59.900708032115354)<1e-9:Math.abs(engineeringBaseline(selectedSource.rows[0])!.hrtHours-90/.4293)<1e-9},
 ];
 const report={runId:randomUUID(),sourceRunId:id,createdAt:new Date().toISOString(),checks,passed:checks.every(c=>c.passed),meaning:"Software and reference-data verification only; not plant safety certification or predictive accuracy validation."};
 await saveDemo("demo_monitoring_verification",report.runId,report.createdAt,session,{runId:id},{sourceHash},report,snapshot.version);return report;
}
export async function monitoringGuard(request:Request){
 const id=request.headers.get("x-aqua-demo-snapshot");if(!id)return null;
 const {snapshot,record}=await loadSnapshot(id);const check=assessment(snapshot,new Date().toISOString());
 if(check.hold)throw new DemoError(`Monitored-run hold: ${check.checks.filter(c=>c.severity==="critical"||c.severity==="unknown").map(c=>c.id==="stale"?"Reading expired (over 60 seconds without an update)":c.label).join("; ")}. Refresh or recover the monitoring reading. Independent planning runs use their own inputs.`,409);
 return {snapshotId:id,sessionId:snapshot.sessionId,sourceVersion:snapshot.version,sourceTimestamp:snapshot.reading.t,receivedAt:snapshot.receivedAt,snapshotHash:record.recordHash,thresholdHash:fingerprint(snapshot.rules),status:check.status};
}
export async function linkModel(context:Awaited<ReturnType<typeof monitoringGuard>>,result:{runId:string;outputHash:string},session:AquaSession){
 if(!context)return undefined;
 const id=randomUUID(),at=new Date().toISOString();
 try{await saveDemo("demo_model_link",id,at,session,{modelRunId:result.runId},context,{modelRunId:result.runId,modelOutputHash:result.outputHash,monitoring:context,basis:"Monitoring context only. The production model uses its own saved planning inputs; sensor values are not substituted into model features."},context.sourceVersion);return {...context,linkId:id,saved:true};}
 catch{return {...context,saved:false,error:"Model completed but the monitoring link could not be saved. Retry linking; do not treat this comparison as recorded."};}
}
