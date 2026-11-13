import {NextResponse} from "next/server";
import {getSession} from "../../lib/auth";
import {listEvidence} from "../../lib/audit";
import {csvCell,evidenceAuthentication} from "../../lib/evidence";
import {demoRules,demoSites,monitoringSource,CURRENT_MONITORING_VERSION,crossingCounts,assessment,engineeringBaseline,type Command} from "../../lib/demo-monitoring";
import {executeDemo,loadSnapshot,verifyDemo,monitoringSourceHash,DemoError} from "../../lib/demo-monitoring-server";
export const runtime="nodejs";
export const maxDuration=60;
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
 const session=await getSession(request);if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
 const q=new URL(request.url).searchParams;
 try{
  if(q.get("view")==="history"){
   if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
   const page=await listEvidence(50,q.get("cursor")??undefined);
   return NextResponse.json({...page,items:page.items.filter(i=>i.record?.kind==="demo_monitoring"||i.readError).map(i=>({id:i.id,createdAt:i.record?.createdAt,sessionId:(i.record?.response as {sessionId?:string})?.sessionId,readError:i.readError}))},{headers});
  }
  if(q.get("runId")){
   if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
   const {record,snapshot}=await loadSnapshot(q.get("runId")!);
   const format=q.get("format");
   if(format==="alarms_csv"||format==="readings_csv"){
    const rows=format==="alarms_csv"?[["alarm_id","rule","severity","value","unit","opened_at","resolved_at","acknowledged_at","acknowledged_by","snapshot_id","session_id","demo_only","transitions"],...snapshot.alarms.map(a=>[a.id,a.label,a.severity,a.value,a.unit,a.openedAt,a.resolvedAt,a.acknowledgedAt,a.acknowledgedBy,snapshot.id,snapshot.sessionId,true,JSON.stringify(a.transitions)])]:[["replayed_at","source_time","fixture",...Object.keys(snapshot.reading).filter(k=>k!=="t"),"snapshot_id","demo_only"],...snapshot.sampleHistory.map(h=>[h.at,h.reading.t,h.fixture,...Object.entries(h.reading).filter(([k])=>k!=="t").map(([,v])=>v),snapshot.id,true])];
    return new Response(rows.map(r=>r.map(csvCell).join(",")).join("\r\n"),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="demo-${snapshot.id}-${format}.csv"`}});
   }
   if(format==="json")return new Response(JSON.stringify({record,authentication:evidenceAuthentication},null,2),{headers:{...headers,"Content-Type":"application/json","Content-Disposition":`attachment; filename="demo-${snapshot.id}-evidence.json"`}});
   return NextResponse.json({snapshot,source:monitoringSource(snapshot.version).metadata,assessment:assessment(snapshot,new Date().toISOString()),baseline:engineeringBaseline(snapshot.reading),audit:{saved:true,recordHash:record.recordHash,sourceHash:monitoringSourceHash(snapshot.version)}},{headers});
  }
  let source;try{source=monitoringSource(q.get("sourceVersion")??CURRENT_MONITORING_VERSION);}catch{throw new DemoError("Unknown monitoring source version.");}
  if(q.get("format")==="source_csv")return new Response([Object.keys(source.rows[0]),...source.rows.map(r=>Object.values(r))].map(r=>r.map(csvCell).join(",")).join("\r\n"),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename=monitoring-${source.rows.length}-readings.csv`}});
  return NextResponse.json({rules:demoRules,sites:demoSites.map(s=>({...s,connected:false,hasReferenceData:s.id==="ainsaade"})),readings:source.rows,source:source.metadata,counts:crossingCounts(source.rows),sourceHash:monitoringSourceHash(source.version),notice:"Reference gas-stream/process thresholds. Not approved plant limits or ambient exposure limits. No equipment control."},{headers});
 }catch(error){return NextResponse.json({error:error instanceof DemoError?error.message:"Monitoring storage could not be read. Retry; no completeness claim is made."},{status:error instanceof DemoError?error.status:503,headers});}
}
export async function POST(request:Request){
 const session=await getSession(request);if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
 let body:{parentId?:string;command?:Command;verifyId?:string};
 try{const raw=await request.text();if(raw.length>12000)return NextResponse.json({error:"Request too large"},{status:413,headers});body=JSON.parse(raw);if(!body||typeof body!=="object")throw new Error();}catch{return NextResponse.json({error:"Valid JSON object required"},{status:400,headers});}
 try{
  if(body.verifyId)return NextResponse.json(await verifyDemo(body.verifyId,session),{headers});
  if(!body.command?.action)throw new DemoError("Monitoring command required.");
  return NextResponse.json(await executeDemo(body.parentId??null,body.command,session),{headers});
 }catch(error){const status=error instanceof DemoError?error.status:error instanceof Error&&/threshold|session|Unknown|Choose|alarm|range|Critical|warning/.test(error.message)?422:503;return NextResponse.json({error:status===503?"Monitoring record was not confirmed saved. Retry or restore the latest record; monitoring is unavailable until recovery.":(error as Error).message},{status,headers});}
}
