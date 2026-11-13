import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {getSession,type AquaSession} from "../../lib/auth";
import {getEvidence,storeEvidence,verifyEvidence,listEvidence,type EvidenceRecord} from "../../lib/audit";
import {fingerprint,evidenceAuthentication,csvCell} from "../../lib/evidence";
import {evaluateWarning,evaluateWarningEvents,earlyWarningVersion,warningSource,warningPolicy,WarningInputError,checkWarningRequest} from "../../lib/early-warning";
export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
const manifest={version:earlyWarningVersion,sourceHash:warningSource.metadata.sha256,policy:warningPolicy,thresholds:warningSource.thresholds};
const manifestHash=fingerprint(manifest);
async function load(id:string){const record=await getEvidence(id);if(!record||!record.kind.startsWith("early_warning"))return null;if(!verifyEvidence(record))throw new Error("Integrity verification failed");return record;}
async function save(kind:EvidenceRecord["kind"],request:unknown,inputs:unknown,response:unknown,session:AquaSession){
 const record=await storeEvidence({id:randomUUID(),createdAt:new Date().toISOString(),username:session.username,role:session.role,kind,request,inputs,response,modelVersion:earlyWarningVersion,manifestHash,requestHash:fingerprint(request),inputsHash:fingerprint(inputs),responseHash:fingerprint(response),outputHash:fingerprint(response)});
 return {runId:record.id,createdAt:record.createdAt,kind,result:response,audit:{saved:true,recordHash:record.recordHash,manifestHash,sourceHash:manifest.sourceHash,authentication:evidenceAuthentication}};
}
export async function GET(request:Request){
 const session=await getSession(request);if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
 const q=new URL(request.url).searchParams;
 try{
  if(q.get("runId")){
   if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
   const record=await load(q.get("runId")!);if(!record)return NextResponse.json({error:"Record not found"},{status:404,headers});
   if(q.get("format")==="json")return new Response(JSON.stringify({record,authentication:evidenceAuthentication},null,2),{headers:{...headers,"Content-Type":"application/json","Content-Disposition":`attachment; filename="early-warning-${record.id}.json"`}});
   return NextResponse.json({runId:record.id,createdAt:record.createdAt,kind:record.kind,result:record.response,audit:{saved:true,recordHash:record.recordHash,manifestHash:record.manifestHash,authentication:evidenceAuthentication}},{headers});
  }
  if(q.get("view")==="history"){
   if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
   const page=await listEvidence(50,q.get("cursor")??undefined);
   return NextResponse.json({...page,items:page.items.filter(i=>i.readError||i.record?.kind.startsWith("early_warning")).map(i=>({id:i.id,kind:i.record?.kind,createdAt:i.record?.createdAt,readError:i.readError})),notice:"Filtered page of the global audit index. Continue through all pages, including empty filtered pages, for a complete listing."},{headers});
  }
  if(q.get("format")==="source_csv")return new Response([Object.keys(warningSource.rows[0]),...warningSource.rows.map(r=>Object.values(r))].map(r=>r.map(csvCell).join(",")).join("\r\n"),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=early-warning-workbook-480.csv"}});
  return NextResponse.json({metadata:warningSource.metadata,version:earlyWarningVersion,policy:warningPolicy,thresholds:warningSource.thresholds,manifestHash,events:warningSource.events,rows:warningSource.rows.map((r,index)=>({index,time:r.Timestamp,ph:r.pH,methane:r.CH4_pct,power:r.Generator_kW,score:evaluateWarning({index,mode:"workbook"}).score,labValues:{codIn:r.COD_In_mgL,codOut:r.COD_Out_mgL,vfa:r.VFA_mgL_as_HAc,alkalinity:r.Alkalinity_mgL_as_CaCO3,tan:r.TAN_mgL}}))},{headers});
 }catch{return NextResponse.json({error:"Audit storage could not be read or verified. Retry; completeness is not confirmed."},{status:503,headers});}
}
export async function POST(request:Request){
 const session=await getSession(request);if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
 let body:Record<string,unknown>;
 try{const text=await request.text();if(text.length>18000)return NextResponse.json({error:"Request too large"},{status:413,headers});body=JSON.parse(text);if(!body||typeof body!=="object"||Array.isArray(body))throw new Error();}catch{return NextResponse.json({error:"Valid JSON object required"},{status:400,headers});}
 try{
  if(body.action==="evaluate"){
   const input=checkWarningRequest(body.input),result=evaluateWarning(input);
   return NextResponse.json(await save("early_warning",body,{request:input,features:result.features,labs:result.labs},result,session),{headers});
  }
  if(body.action==="evaluate_events")return NextResponse.json(await save("early_warning_evaluation",body,{sourceHash:manifest.sourceHash,policy:warningPolicy},evaluateWarningEvents(),session),{headers});
  if(body.action==="review"){
   if(typeof body.runId!=="string"||typeof body.note!=="string"||body.note.trim().length<5||body.note.length>2000||!["advisory","fixed_alarm"].includes(String(body.channel)))throw new WarningInputError("Review needs a run ID, channel and a note of 5–2,000 characters.");
   const record=await load(body.runId);if(!record||record.kind!=="early_warning")return NextResponse.json({error:"Assessment not found"},{status:404,headers});
   const original=record.response as ReturnType<typeof evaluateWarning>;
   if(body.channel==="advisory"&&!['high-risk','predictive warning'].includes(original.advisory)||body.channel==="fixed_alarm"&&!original.fixedAlarms.some(a=>a.status==="warning"||a.status==="critical"))throw new WarningInputError("The selected channel has no active condition in this assessment.");
   return NextResponse.json(await save("early_warning_review",body,{parentRunId:record.id,parentHash:record.recordHash},{parentRunId:record.id,channel:body.channel,note:body.note.trim(),reviewedBy:session.username,decision:"Review recorded; original condition remains unchanged. No equipment command issued."},session),{headers});
  }
  if(body.action==="verify"){
   if(typeof body.runId!=="string")throw new WarningInputError("A run ID is required.");
   const record=await load(body.runId);if(!record||record.kind!=="early_warning")return NextResponse.json({error:"Assessment not found"},{status:404,headers});
   const original=record.response as ReturnType<typeof evaluateWarning>,replayed=evaluateWarning(original.request);
   const checks=[{name:"Server authentication and record integrity",passed:verifyEvidence(record)},{name:"Current rule manifest matches saved version",passed:record.manifestHash===manifestHash},{name:"Replayed output matches saved output",passed:fingerprint(replayed)===record.outputHash},{name:"Future labels excluded from scoring features",passed:!Object.keys(original.features).some(k=>/future|onset|scenario|hidden/i.test(k))},{name:"No equipment actuation",passed:replayed.automation.includes("No equipment control")}];
   return NextResponse.json(await save("early_warning_verification",body,{parentRunId:record.id,parentHash:record.recordHash},{parentRunId:record.id,checks,passed:checks.every(c=>c.passed),meaning:"Software replay/integrity checks, not independent plant validation."},session),{headers});
  }
  throw new WarningInputError("Choose evaluate, evaluate_events, review or verify.");
 }catch(error){return NextResponse.json({error:error instanceof WarningInputError?error.message:"Record could not be confirmed saved. No successful save is claimed; retry or retrieve by ID."},{status:error instanceof WarningInputError?422:503,headers});}
}
