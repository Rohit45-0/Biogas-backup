import {NextResponse} from "next/server";
import {getSession,canAudit} from "../../../lib/auth";
import {getEvidence,validRunId,verifyEvidence} from "../../../lib/audit";
import {InputError} from "../../../lib/inputs";
import {hrtStudyMetadata} from "../../../lib/hrt-optimization";
import {executeHrtStudy,hrtStudyCsv,verifyHrtStudy,type HrtStudyResult} from "../../../lib/hrt-optimization-execution";

export const runtime="nodejs";
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  const query=new URL(request.url).searchParams,id=query.get("runId");
  if(!id)return NextResponse.json(hrtStudyMetadata(),{headers});
  if(!canAudit(session))return NextResponse.json({error:"Reviewer or admin access required"},{status:403,headers});
  if(!validRunId(id))return NextResponse.json({error:"Invalid run ID"},{status:400,headers});
  try{
    if(query.get("verify")==="true"){const result=await verifyHrtStudy(id);return NextResponse.json(result.data,{status:result.http,headers});}
    const record=await getEvidence(id);
    if(!record||record.kind!=="hrt_optimization")return NextResponse.json({error:"HRT study record not found"},{status:404,headers});
    if(!verifyEvidence(record))return NextResponse.json({error:"Stored evidence integrity failed"},{status:409,headers});
    const result=record.response as HrtStudyResult;
    if(query.get("format")==="csv")return new Response(hrtStudyCsv(result),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="aquaivolt-hrt-${id}-scenarios.csv"`}});
    return NextResponse.json({...result,audit:{saved:true,recordHash:record.recordHash}},{headers});
  }catch{return NextResponse.json({error:"HRT study evidence could not be read"},{status:503,headers});}
}
export async function POST(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(!canAudit(session))return NextResponse.json({error:"Reviewer or admin access required"},{status:403,headers});
  let body:unknown;
  try{const raw=await request.text();if(raw.length>8000)return NextResponse.json({error:"Request too large"},{status:413,headers});body=JSON.parse(raw);}catch{return NextResponse.json({error:"Valid JSON is required"},{status:400,headers});}
  try{return NextResponse.json(await executeHrtStudy(body,session),{headers});}
  catch(error){if(error instanceof InputError)return NextResponse.json({error:error.message,issues:error.issues},{status:422,headers});return NextResponse.json({error:"HRT optimization could not complete this run"},{status:500,headers});}
}
