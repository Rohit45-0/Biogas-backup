import type {ScenarioInputCheck,ScenarioStream} from "./scenario-input-coverage";

export type ScenarioAlert={id:string;signature:string;state:"active"|"resolved"|"superseded";acknowledged:boolean;check:ScenarioInputCheck};
export type ScenarioAlertState={events:ScenarioAlert[];latest:Partial<Record<ScenarioStream,ScenarioInputCheck>>};
export const emptyScenarioAlerts=():ScenarioAlertState=>({events:[],latest:{}});
export function recordScenarioCheck(state:ScenarioAlertState,check:ScenarioInputCheck):ScenarioAlertState{
  const signature=JSON.stringify([check.catalogHash,check.contextId,check.fields.filter(field=>field.status==="OUTSIDE").map(field=>[field.key,field.value,field.min,field.max])]);
  const repeated=state.events.some(event=>event.state==="active"&&event.check.stream===check.stream&&event.signature===signature);
  // Missing inputs cannot clear a warning. Unrelated unavailable fields do not
  // prevent resolution when every previously flagged input is now within range.
  const events=state.events.map(event=>{
    if(event.state!=="active"||event.check.stream!==check.stream||repeated)return event;
    if(check.status==="OUT_OF_RANGE")return {...event,state:"superseded" as const};
    const resolved=check.status==="WITHIN_SCENARIO_RANGES"||event.check.contextId===check.contextId&&event.check.fields.filter(field=>field.status==="OUTSIDE").every(field=>check.fields.find(next=>next.key===field.key)?.status==="WITHIN");
    return resolved?{...event,state:"resolved" as const}:event;
  });
  if(check.status==="OUT_OF_RANGE"&&!repeated)events.unshift({id:check.id,signature,state:"active",acknowledged:false,check});
  let historySlots=30-events.filter(event=>event.state==="active").length;
  return {events:events.filter(event=>event.state==="active"||historySlots-->0),latest:{...state.latest,[check.stream]:check}};
}
export function acknowledgeScenarioAlert(state:ScenarioAlertState,id:string):ScenarioAlertState{
  return {...state,events:state.events.map(event=>event.id===id?{...event,acknowledged:true}:event)};
}
export function restoreScenarioAlerts(value:unknown,catalogHash:string):ScenarioAlertState{
  const saved=value as {catalogHash?:string;state?:ScenarioAlertState}|null;
  if(saved?.catalogHash!==catalogHash||!saved.state||!Array.isArray(saved.state.events)||!saved.state.latest)return emptyScenarioAlerts();
  function valid(check:ScenarioInputCheck){return check&&check.catalogHash===catalogHash&&["manual","task1","task2"].includes(check.stream)&&typeof check.contextLabel==="string"&&typeof check.sampleLabel==="string"&&typeof check.checkedAt==="string"&&Array.isArray(check.fields)&&check.fields.every(field=>typeof field.label==="string"&&typeof field.unit==="string"&&(field.value===null||Number.isFinite(field.value))&&(field.min===null||Number.isFinite(field.min))&&(field.max===null||Number.isFinite(field.max)));}
  const events=saved.state.events.filter(event=>event&&typeof event.id==="string"&&typeof event.signature==="string"&&typeof event.acknowledged==="boolean"&&["active","resolved","superseded"].includes(event.state)&&valid(event.check)).slice(0,30);
  const latest=Object.fromEntries(Object.entries(saved.state.latest).filter(([key,check])=>["manual","task1","task2"].includes(key)&&valid(check)));
  return {events,latest};
}
