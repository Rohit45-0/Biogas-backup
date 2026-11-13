import {NextResponse} from "next/server";
import {getSession} from "../../../lib/auth";
import {listEvidence,verifyEvidence} from "../../../lib/audit";
export const runtime="nodejs";
export const maxDuration=60;
export async function GET(request:Request){
 const headers={"Cache-Control":"no-store"},session=await getSession(request);
 if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
 if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
 try{const page=await listEvidence(50,new URL(request.url).searchParams.get("cursor")??undefined);
 return NextResponse.json({...page,items:page.items.filter(i=>i.readError||i.record?.kind==="hrt_research").map(i=>({id:i.id,createdAt:i.record?.createdAt,modelVersion:i.record?.modelVersion,readError:i.readError,integrity:i.record?verifyEvidence(i.record):false}))},{headers});
 }catch{return NextResponse.json({error:"Saved report index could not be read. Retry or retrieve a known run ID from Audit Trail."},{status:503,headers});}
}
