import {NextResponse} from "next/server";
import {getSession,canAudit} from "../../lib/auth";
import {getEvidence,listEvidence,validRunId,verifyEvidence,inspectEvidence} from "../../lib/audit";
import {csvCell,authenticationFor} from "../../lib/evidence";
import {AuditCursorError} from "../../lib/audit-pagination";

export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(!canAudit(session))return NextResponse.json({error:"Reviewer or admin access required"},{status:403,headers});
  const url=new URL(request.url),id=url.searchParams.get("runId");
  try{
    if(id){
      if(!validRunId(id))return NextResponse.json({error:"Invalid run ID"},{status:400,headers});
      const record=await getEvidence(id);
      if(!record)return NextResponse.json({error:"Record not found"},{status:404,headers});
      const diagnostics=inspectEvidence(record),integrity=diagnostics.integrity,authentication=authenticationFor(integrity);
      const exportHeaders={...headers,"X-Aquaivolt-Integrity":integrity?"PASS":"FAIL","X-Aquaivolt-Authentication":authentication.type};
      const prefix=integrity?"aquaivolt":"UNVERIFIED-INTEGRITY-FAILED-aquaivolt";
      const format=url.searchParams.get("format");
      if(format==="json")return new Response(JSON.stringify({authentication,integrity,diagnostics,record},null,2),{headers:{...exportHeaders,"Content-Type":"application/json","Content-Disposition":`attachment; filename="${prefix}-${id}.json"`}});
      if(format==="csv"){
        const columns=["id","createdAt","kind","username","modelVersion","manifestHash","recordHash","signature","inputs","request","response"] as const;
        const csv=["authentication_type,authentication_algorithm,independently_verifiable,integrity,verification_status,warning,diagnostics,"+columns.join(","),[authentication.type,authentication.algorithm,false,integrity,authentication.verificationStatus,authentication.explanation,JSON.stringify(diagnostics),...columns.map(k=>typeof record[k]==="object"?JSON.stringify(record[k]):record[k])].map(csvCell).join(",")].join("\r\n");
        return new Response(csv,{headers:{...exportHeaders,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${prefix}-evidence-${id}.csv"`}});
      }
      return NextResponse.json({authentication,integrity,diagnostics,record},{headers:exportHeaders});
    }
    const requested=Number(url.searchParams.get("limit")??20);
    if(!Number.isInteger(requested)||requested<1||requested>50)return NextResponse.json({error:"Limit must be 1-50"},{status:400,headers});
    const page=await listEvidence(requested,url.searchParams.get("cursor")??undefined);
    return NextResponse.json({runs:page.items.map(({id,storedAt,record:r,readError})=>({id,storedAt,createdAt:r?.createdAt??storedAt,kind:r?.kind??"unreadable",username:r?.username??"Unavailable",modelVersion:r?.modelVersion??"Unavailable",integrity:r?verifyEvidence(r):false,recordHash:r?.recordHash,readError})),cursor:page.cursor,hasMore:page.hasMore,total:page.total,snapshot:page.snapshot,order:"storedAt_desc_id_desc"},{headers});
  }catch(error){
    if(error instanceof AuditCursorError)return NextResponse.json({error:error.message},{status:400,headers});
    return NextResponse.json({error:"Audit storage could not be read. Retry later; no records have been discarded."},{status:503,headers});
  }
}
