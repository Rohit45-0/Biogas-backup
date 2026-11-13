"use client";

import {createContext,useCallback,useContext,useEffect,useId,useRef,useState,type ReactNode,type FormEvent} from "react";
import {AlertTriangle,Bell,CheckCircle2} from "lucide-react";
import type {ScenarioCoverageCatalog,ScenarioInputCheck,ScenarioStream,ScenarioValues} from "../lib/scenario-input-coverage";
import {acknowledgeScenarioAlert,emptyScenarioAlerts,recordScenarioCheck,restoreScenarioAlerts,type ScenarioAlertState} from "../lib/scenario-alert-state";
import "./scenario-alerts.css";

type CheckRequest={stream:ScenarioStream;contextId:string;values:ScenarioValues;sampleLabel?:string;runId?:string};
type Monitor={catalog:ScenarioCoverageCatalog|null;state:ScenarioAlertState;error:string;checkInputs:(request:CheckRequest)=>Promise<ScenarioInputCheck|null>;acknowledge:(id:string)=>void;retry:()=>void};
const Context=createContext<Monitor|null>(null);
const endpoint="/api/research/input-check";
const n=(value:number|null)=>value===null?"Not provided":value.toLocaleString(undefined,{maximumFractionDigits:6});
async function api<T>(url:string,body?:unknown):Promise<T>{
  const response=await fetch(url,{cache:"no-store",...(body===undefined?{}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok)throw new Error(data.issues?.map((issue:{field:string;message:string})=>`${issue.field}: ${issue.message}`).join("; ")||data.error||"Input range check failed");return data;
}
export function ScenarioAlertsProvider({username,children}:{username:string;children:ReactNode}){
  const [catalog,setCatalog]=useState<ScenarioCoverageCatalog|null>(null),[state,setState]=useState<ScenarioAlertState>(emptyScenarioAlerts),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
  const mounted=useRef(false),loading=useRef<Promise<ScenarioCoverageCatalog>|null>(null),sequence=useRef({task1:0,task2:0,manual:0});
  const storageKey=`aqua-scenario-alerts-v1:${username}`;
  useEffect(()=>{mounted.current=true;let active=true;
    loading.current=api<ScenarioCoverageCatalog>(endpoint).then(data=>{
      if(active){let saved=emptyScenarioAlerts();try{saved=restoreScenarioAlerts(JSON.parse(sessionStorage.getItem(storageKey)||"null"),data.catalogHash);}catch{/* Ignore invalid browser cache. */}setState(saved);setCatalog(data);setError("");}return data;
    });
    void loading.current.catch(()=>{if(active)setError("Scenario range monitoring is unavailable. Retry before relying on input checks.");});
    return()=>{active=false;mounted.current=false;};
  },[storageKey,attempt]);
  useEffect(()=>{if(catalog)try{sessionStorage.setItem(storageKey,JSON.stringify({catalogHash:catalog.catalogHash,state}));}catch{/* Session storage is optional; alerts still work in memory. */}},[catalog,state,storageKey]);
  const checkInputs=useCallback(async(request:CheckRequest)=>{
    const serial=++sequence.current[request.stream];
    try{
      await loading.current;if(!mounted.current)return null;
      const result=await api<ScenarioInputCheck>(endpoint,request);
      if(mounted.current&&sequence.current[request.stream]===serial){setError("");setState(previous=>recordScenarioCheck(previous,result));return result;}
    }catch(e){if(mounted.current&&sequence.current[request.stream]===serial)setError(`Scenario range check unavailable: ${e instanceof Error?e.message:"please retry"}`);}
    return null;
  },[]);
  const acknowledge=useCallback((id:string)=>setState(previous=>acknowledgeScenarioAlert(previous,id)),[]);
  return <Context.Provider value={{catalog,state,error,checkInputs,acknowledge,retry:()=>setAttempt(value=>value+1)}}>{children}</Context.Provider>;
}
export function useScenarioAlerts(){const monitor=useContext(Context);if(!monitor)throw new Error("ScenarioAlertsProvider is required");return monitor;}
export function ScenarioAlertCount(){const {state}=useScenarioAlerts(),count=state.events.filter(event=>event.state==="active").length;return count?<small className="sa-count" aria-hidden="true">{count}</small>:null;}
export function ScenarioAlertBell({onOpen}:{onOpen:()=>void}){
  const {state}=useScenarioAlerts(),count=state.events.filter(event=>event.state==="active").length,descriptionId=useId();
  return <button className="hr-secondary sa-bell" aria-label="Open alerts" aria-describedby={descriptionId} title={count?`${count} active scenario alerts`:"Scenario input alerts"} onClick={onOpen}><Bell size={17}/><ScenarioAlertCount/><span id={descriptionId} hidden>{count} active scenario alerts</span></button>;
}
export function ScenarioAlertBanner({onOpen}:{onOpen:()=>void}){
  const {state,error,acknowledge}=useScenarioAlerts();const event=state.events.find(item=>item.state==="active"&&!item.acknowledged);
  if(!event&&!error)return null;
  return <div className="sa-dashboard-notice" role="alert" aria-label="Scenario input notification"><AlertTriangle size={24}/><div><b>{event?"Scenario input out of range":"Scenario range monitoring unavailable"}</b>
    {event&&<><p>{event.check.sampleLabel} · {event.check.contextLabel}</p><ul>{event.check.fields.filter(field=>field.status==="OUTSIDE").slice(0,3).map(field=><li key={field.key}>{field.label}: <strong>{n(field.value)} {field.unit}</strong> · scenario range {n(field.min)}–{n(field.max)} {field.unit}</li>)}</ul><small>Scenario data only · no live plant inputs connected</small></>}
    {error&&<p>{error}</p>}</div><div className="sa-notice-actions"><button onClick={onOpen}>Review alerts</button>{event&&<button onClick={()=>acknowledge(event.id)}>Acknowledge</button>}</div></div>;
}
export default function ScenarioAlertsPanel(){
  const {catalog,state,error,checkInputs,acknowledge,retry}=useScenarioAlerts();
  const [contextId,setContextId]=useState(""),[values,setValues]=useState<ScenarioValues>({}),[busy,setBusy]=useState(false),[sampleLabel,setSampleLabel]=useState("Manual scenario check");
  const context=catalog?.contexts.find(item=>item.id===contextId)??catalog?.contexts[0];
  const latest=state.latest.manual;
  const active=state.events.filter(event=>event.state==="active");
  const draft=contextId?values:context?.example??{};
  async function submit(event?:FormEvent,exampleOutside=false){
    event?.preventDefault();if(!context||busy)return;
    let input=draft,label=sampleLabel;
    if(exampleOutside){
      const field=context.fields.find(item=>item.key==="temperatureC"&&item.max!==null)??context.fields.find(item=>item.max!==null)!;
      input={...context.example,[field.key]:Number((field.max!+Math.max(1,(field.max!-field.min!)*.1)).toFixed(6))};label="Out-of-range scenario example";
      setContextId(context.id);setValues(input);setSampleLabel(label);
    }
    setBusy(true);try{await checkInputs({stream:"manual",contextId:context.id,values:input,sampleLabel:label});}finally{setBusy(false);}
  }
  const unchanged=latest&&context?.id===latest.contextId&&context.fields.every(field=>(draft[field.key]??null)===latest.fields.find(item=>item.key===field.key)?.value);
  return <section className="sa-panel" aria-label="Scenario input monitoring">
    <header><div><small>SCENARIO INPUT MONITOR</small><h2>Out-of-range notifications</h2><p>Check scenario inputs against their own model or reactor pathway. Alerts appear across the dashboard.</p></div><span className="sa-status">{active.length} active</span></header>
    <p className="sa-explanation">Scenario data only. Real plant / PLC inputs are not connected. Reference ranges describe data coverage, not validated safety limits.</p>
    {error&&<p role="alert">{error} <button onClick={retry}>Retry monitoring</button></p>}
    {!context?<p role="status">Loading scenario ranges…</p>:<form onSubmit={event=>void submit(event)}>
      <fieldset disabled={busy} className="sa-fields"><label className="sa-wide">Scenario pathway<select aria-label="Scenario pathway" value={context.id} onChange={event=>{const next=catalog!.contexts.find(item=>item.id===event.target.value)!;setContextId(next.id);setValues({...next.example});setSampleLabel("Manual scenario check");}}>{catalog!.contexts.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        {context.fields.map(field=><label key={field.key}>{field.label}{field.unit?` (${field.unit})`:""}<input aria-label={`Scenario ${field.label}`} type="number" step="any" value={draft[field.key]??""} placeholder="Not provided" onChange={event=>{setContextId(context.id);setValues({...draft,[field.key]:event.target.value===""?null:event.target.valueAsNumber});setSampleLabel("Manual scenario check");}}/><small>{field.min===null?field.note:`Source range: ${n(field.min)}–${n(field.max)} ${field.unit}`}</small></label>)}
      </fieldset>
      <div className="sa-controls"><button className="sa-primary" disabled={busy}>{busy?"Checking…":"Check scenario inputs"}</button><button type="button" disabled={busy} onClick={()=>void submit(undefined,true)}>Try out-of-range example</button><button type="button" disabled={busy} onClick={()=>{setContextId(context.id);setValues({...context.example});setSampleLabel("Source scenario example");}}>Load in-range example</button></div>
      <p className="sa-explanation">The example buttons only change this input check. Optimization settings, predictions and audit records stay as calculated.</p>
      {latest&&!unchanged&&<p className="sa-draft">Inputs changed. Check them again to update the notifications below.</p>}
    </form>}
    {latest&&<article className="sa-check-result" data-status={latest.status}><h3>{latest.status==="OUT_OF_RANGE"?"Outside scenario data range":latest.status==="PARTIAL_CHECK"?"Check incomplete — some inputs cannot be assessed":"Within individual scenario ranges"}</h3><p>{latest.contextLabel} · {new Date(latest.checkedAt).toLocaleString()}</p><div className="sa-table-wrap"><table><thead><tr><th>Input</th><th>Value</th><th>Source range</th><th>Result</th></tr></thead><tbody>{latest.fields.map(field=><tr key={field.key}><th>{field.label}</th><td>{n(field.value)} {field.unit}</td><td>{field.min===null?"Unavailable":`${n(field.min)}–${n(field.max)} ${field.unit}`}</td><td>{field.status==="WITHIN"?"Within range":field.status==="OUTSIDE"?"Out of range":field.status==="MISSING"?"Missing input":"Units unresolved"}</td></tr>)}</tbody></table></div><p>{latest.meaning}</p></article>}
    {Boolean(state.latest.task1||state.latest.task2)&&<div className="sa-history" aria-label="Automatic scenario checks"><h3>Latest automatic checks</h3>{[state.latest.task1,state.latest.task2].filter((check):check is ScenarioInputCheck=>Boolean(check)).map(check=><article key={check.stream}><div><div><b>{check.sampleLabel}</b><p>{check.contextLabel}</p><small>{new Date(check.checkedAt).toLocaleString()} · {check.status==="OUT_OF_RANGE"?`${check.outsideCount} out-of-range inputs`:check.status==="PARTIAL_CHECK"?"Within available ranges; some inputs could not be assessed":"Within individual scenario ranges"}</small></div></div></article>)}</div>}
    <div className="sa-history"><h3>Notification history <small>This browser session</small></h3>{!state.events.length?<p>No out-of-range scenario inputs detected. Completed optimization scenarios are checked automatically.</p>:state.events.map(event=><article key={event.id} data-state={event.state}><div>{event.state==="active"?<AlertTriangle size={21}/>:<CheckCircle2 size={21}/>}<div><b>{event.check.sampleLabel}</b><p>{event.check.contextLabel}</p><ul>{event.check.fields.filter(field=>field.status==="OUTSIDE").map(field=><li key={field.key}>{field.label} {n(field.value)} {field.unit}; source range {n(field.min)}–{n(field.max)} {field.unit}</li>)}</ul><small>{new Date(event.check.checkedAt).toLocaleString()} · {event.state==="active"?(event.acknowledged?"Active · acknowledged":"Active · needs review"):event.state==="resolved"?"Resolved by a later in-range check":"Replaced by a newer out-of-range check"}</small></div></div>{event.state==="active"&&!event.acknowledged&&<button onClick={()=>acknowledge(event.id)}>Acknowledge</button>}</article>)}</div>
  </section>;
}
