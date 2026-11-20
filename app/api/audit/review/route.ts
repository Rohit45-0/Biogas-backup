import {NextResponse} from "next/server";
import {canAudit,getSession,listAccounts,sameOrigin} from "../../../lib/auth";
import {getEvidence,inspectEvidence,storeEvidence,verifyEvidence} from "../../../lib/audit";
import {fingerprint} from "../../../lib/evidence";
import {mlManifestHash} from "../../../lib/ml-manifest";
import {validationProtocol} from "../../../lib/plant-validation";
import {compareWarningPolicies} from "../../../lib/early-warning";
import {historicalExceptionIds,reviewInputs,reviewScope,reviewVersion,type ReviewCheck} from "../../../lib/auditor-review";
import {POST as predict} from "../../ml/predict/route";
import {POST as verify} from "../../ml/verify/route";
import type {MlResult} from "../../../lib/ml-execution";
export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
async function history(){return Promise.all(historicalExceptionIds.map(async id=>{
  const record=await getEvidence(id);
  return {id,found:!!record,recordHash:record?.recordHash??null,diagnostics:record?inspectEvidence(record):null};
}));}
export async function GET(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(!canAudit(session))return NextResponse.json({error:"Reviewer or admin access required"},{status:403,headers});
  try{
    const accounts=await listAccounts();
    return NextResponse.json({version:reviewVersion,checkedAt:new Date().toISOString(),sourceRevision:process.env.AQUA_SOURCE_REVISION||process.env.VERCEL_GIT_COMMIT_SHA||null,
      deployment:process.env.VERCEL_DEPLOYMENT_ID||"local",signedInAs:{username:session.username,role:session.role},
      credentials:accounts.filter(a=>["admin","user"].includes(a.username)).map(a=>({username:a.username,managed:a.source==="managed",credentialUpdatedAt:a.updatedAt})),
      reviewers:accounts.filter(a=>a.role==="reviewer"&&!a.disabled).map(a=>({username:a.username,assignedTo:a.displayName})),
      historical:await history(),scope:reviewScope,protocol:validationProtocol,
      nextActions:["Use one reviewer account per assigned person; do not share administrator sessions.","Historical HMAC cause remains unconfirmed until original signing context is recovered. Preserve all eight originals.","Plant equipment arrival is reported by the client; commissioning and measured-data acceptance are not yet evidenced."]},{headers});
  }catch{return NextResponse.json({error:"Review evidence unavailable. No completion status has been inferred."},{status:503,headers});}
}
export async function POST(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(!canAudit(session))return NextResponse.json({error:"Reviewer or admin access required"},{status:403,headers});
  if(!sameOrigin(request))return NextResponse.json({error:"Invalid origin"},{status:403,headers});
  let body:Record<string,unknown>;
  try{
    const raw=await request.text();
    if(raw.length>512)return NextResponse.json({error:"Request too large"},{status:413,headers});
    body=JSON.parse(raw);
  }catch{return NextResponse.json({error:"Valid JSON object required"},{status:400,headers});}
  if(!body||Array.isArray(body)||body.action!=="run_checks"||Object.keys(body).some(k=>k!=="action"))return NextResponse.json({error:"Use action run_checks"},{status:422,headers});
  try{
    const checks:ReviewCheck[]=[];
    const check=(name:string,ok:boolean,expected:string,observed:string)=>checks.push({name,status:ok?"PASS":"FAIL",expected,observed});
    // Exercise the existing handlers with the caller's authorization; no alternate inference path.
    const invoke=async(handler:(request:Request)=>Promise<Response>,route:string,payload:unknown)=>{
      const response=await handler(new Request(new URL(route,request.url),{method:"POST",headers:{"Content-Type":"application/json",Cookie:request.headers.get("cookie")||""},body:JSON.stringify(payload)}));
      return {http:response.status,data:await response.json()};
    };
    const submitted={operatingConditions:reviewInputs};
    const first=await invoke(predict,"/api/ml/predict",submitted),second=await invoke(predict,"/api/ml/predict",submitted);
    const a=first.data as MlResult,b=second.data as MlResult;
    check("Both trained models execute and persist",first.http===200&&second.http===200&&a.audit?.saved&&b.audit?.saved&&a.predictions?.length===2,"Two saved runs, two trained models per run",`HTTP ${first.http}/${second.http}; ${a.runId??"missing"} / ${b.runId??"missing"}`);
    check("Identical inputs reproduce identical outputs",Boolean(a.outputHash&&a.outputHash===b.outputHash&&a.runId!==b.runId),"Identical output hashes; distinct run IDs",a.outputHash??"No output hash");
    const invalid=await invoke(predict,"/api/ml/predict",{operatingConditions:{...reviewInputs,ph:null}});
    check("Null pH rejected",invalid.http===422&&invalid.data.issues?.some((i:{field:string})=>i.field==="ph"),"HTTP 422 with pH issue",`HTTP ${invalid.http}`);
    const replay=a.runId?await invoke(verify,"/api/ml/verify",{runId:a.runId}):{http:0,data:{}};
    check("Saved ML run passes all 11 verification checks",replay.http===200&&replay.data.status==="PASS"&&replay.data.saved===true&&replay.data.checks?.length===11,"11 passing checks and saved verification record",`${replay.data.status??"NOT RUN"}; ${replay.data.reportId??"no record"}`);
    const original=await history();
    check("Historical exceptions remain retrievable",original.every(r=>r.found),"All eight original records remain available",`${original.filter(r=>r.found).length}/8 found`);
    const warning=compareWarningPolicies();
    check("Early-warning comparison includes all events",warning.events.length===6&&warning.events.every(e=>e.candidate.earlierThanFixed===(e.candidate.leadHoursVersusFirstFixed!==null&&e.candidate.leadHoursVersusFirstFixed>0)),"Six events; signed lead time versus first fixed alarm",`${warning.candidate.earlierThanFixed}/6 earlier; ${warning.candidate.falseAdvisoryHours}/${warning.candidate.normalHours} normal advisory hours`);
    const id=crypto.randomUUID(),createdAt=new Date().toISOString();
    const result={reportId:id,createdAt,version:reviewVersion,status:checks.every(c=>c.status==="PASS")?"PASS":"FAIL",checks,scope:reviewScope,
      sourceRevision:process.env.AQUA_SOURCE_REVISION||process.env.VERCEL_GIT_COMMIT_SHA||null,deployment:process.env.VERCEL_DEPLOYMENT_ID||"local",
      request:submitted,runIds:[a.runId,b.runId,replay.data.reportId].filter(Boolean),historical:original,warning,
      historicalAuthentication:original.every(r=>r.diagnostics?.integrity)?"VERIFIED":"UNRESOLVED",
      plantValidation:"PENDING_COMMISSIONING_AND_INDEPENDENT_DATA",securityLogoutTest:"Separate copied-cookie HTTP test required; this checklist does not sign you out."};
    const record=await storeEvidence({id,createdAt,username:session.username,role:session.role,kind:"audit_review",request:body,inputs:reviewInputs,response:result,modelVersion:reviewVersion,manifestHash:mlManifestHash,requestHash:fingerprint(body),inputsHash:fingerprint(reviewInputs),responseHash:fingerprint(result),outputHash:fingerprint(checks)});
    return NextResponse.json({...result,saved:verifyEvidence(record)},{headers});
  }catch{return NextResponse.json({error:"Review checks or evidence persistence failed. No passing report issued."},{status:503,headers});}
}
