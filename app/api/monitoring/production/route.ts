import {NextResponse} from "next/server";
import {getSession} from "../../../lib/auth";
import {InputError} from "../../../lib/inputs";
import {executeResearch} from "../../../lib/hrt-research-execution";
import {executeReactorSearch} from "../../../lib/reactor-search-execution";
import {monitoringGuard,linkModel,DemoError} from "../../../lib/demo-monitoring-server";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store"},session=await getSession(request);
 if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
 if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
 const model=new URL(request.url).searchParams.get("model");if(!["hrt","reactor-search"].includes(model??""))return NextResponse.json({error:"Choose hrt or reactor-search"},{status:422,headers});
 let body:unknown;try{const raw=await request.text();if(raw.length>8000)return NextResponse.json({error:"Request too large"},{status:413,headers});body=JSON.parse(raw);}catch{return NextResponse.json({error:"Valid JSON required"},{status:400,headers});}
 try{const monitoring=await monitoringGuard(request);if(!monitoring)throw new DemoError("A saved monitoring snapshot header is required.");const result=model==="hrt"?await executeResearch(body,session):await executeReactorSearch(body,session);return NextResponse.json({...result,demoMonitoring:await linkModel(monitoring,result,session)},{headers});}
 catch(error){if(error instanceof DemoError)return NextResponse.json({error:error.message},{status:error.status,headers});if(error instanceof InputError)return NextResponse.json({error:error.message,issues:error.issues},{status:422,headers});return NextResponse.json({error:"Monitored production run failed. Monitoring remains available."},{status:500,headers});}
}
