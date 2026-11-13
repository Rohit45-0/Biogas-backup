import {NextResponse} from "next/server";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {getSession,canAudit} from "../../../lib/auth";
import {getEvidence,validRunId,verifyEvidence} from "../../../lib/audit";
import {InputError} from "../../../lib/inputs";
import {reactorSearchMetadata} from "../../../lib/reactor-search";
import {executeReactorSearch,verifyReactorSearch,reactorSearchCsv,reactorSearchKpiCsv,type ReactorSearchResult} from "../../../lib/reactor-search-execution";
export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
 const session=await getSession(request);if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
 const query=new URL(request.url).searchParams,id=query.get("runId"),format=query.get("format");
 try{
  if(!id&&format==="workbook")return new Response(new Uint8Array(await readFile(path.join(process.cwd(),"ai-workflow/research/reactor-study-2026-11-09/Aquaivolt Task 2 - 400 Scenarios.xlsx"))),{headers:{...headers,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":"attachment; filename=\"Aquaivolt Task 2 - 400 Training Scenarios.xlsx\""}});
  if(!id&&format==="guide")return new Response(await readFile(path.join(process.cwd(),"docs/TASK2_AUDITOR_GUIDE_2026-11-09.md"),"utf8"),{headers:{...headers,"Content-Type":"text/markdown; charset=utf-8","Content-Disposition":"attachment; filename=\"Aquaivolt Reactor Model - Auditor Guide.md\""}});
  if(!id)return NextResponse.json(reactorSearchMetadata(),{headers});
  if(!canAudit(session))return NextResponse.json({error:"Reviewer or admin access required"},{status:403,headers});
  if(!validRunId(id))return NextResponse.json({error:"Invalid run ID"},{status:400,headers});
  if(query.get("verify")==="true"){const result=await verifyReactorSearch(id);return NextResponse.json(result.data,{status:result.http,headers});}
  const record=await getEvidence(id);if(!record||record.kind!=="reactor_search")return NextResponse.json({error:"Generated reactor study record not found"},{status:404,headers});
  if(!verifyEvidence(record))return NextResponse.json({error:"Stored evidence integrity failed"},{status:409,headers});
  const result=record.response as ReactorSearchResult;
  if(format==="csv"||format==="kpi_csv")return new Response(format==="csv"?reactorSearchCsv(result):reactorSearchKpiCsv(result),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="aquaivolt-reactor-${id}-${format==="csv"?"scenarios":"kpis"}.csv"`}});
  return NextResponse.json({...result,audit:{saved:true,provider:"saved-record",recordHash:record.recordHash}},{headers});
 }catch{return NextResponse.json({error:"Generated reactor evidence or download could not be read"},{status:503,headers});}
}
export async function POST(request:Request){
 const session=await getSession(request);if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});if(!canAudit(session))return NextResponse.json({error:"Reviewer or admin access required"},{status:403,headers});
 let body:unknown;try{const raw=await request.text();if(raw.length>8000)return NextResponse.json({error:"Request too large"},{status:413,headers});body=JSON.parse(raw);}catch{return NextResponse.json({error:"Valid JSON is required"},{status:400,headers});}
 try{return NextResponse.json(await executeReactorSearch(body,session),{headers});}catch(error){if(error instanceof InputError)return NextResponse.json({error:error.message,issues:error.issues},{status:422,headers});return NextResponse.json({error:"Generated reactor optimization could not complete this run"},{status:500,headers});}
}
