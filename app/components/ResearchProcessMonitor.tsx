"use client";

import {useEffect,useRef,useState,type CSSProperties} from "react";
import {Activity,ArrowRight,CheckCircle2,Clock3,Cpu,Database,Droplets,Factory,Flame,FlaskConical,LoaderCircle,Play,Radio,ShieldCheck,SlidersHorizontal,Unplug,Zap} from "lucide-react";
import type {ResearchResult} from "../lib/hrt-research-execution";
import type {ResearchPoint} from "../lib/hrt-research";
import "./research-process-monitor.css";

type Props={result:ResearchResult|null;busy:boolean;canRun?:boolean;onRun:(minimumDisplayMs?:number)=>Promise<ResearchResult|null>;onAudit:(id:string)=>void};
const number=(value:number|null|undefined,digits=1)=>value===null||value===undefined?"—":value.toLocaleString(undefined,{maximumFractionDigits:digits});
const stageIcons=[Radio,ShieldCheck,SlidersHorizontal,Database,Activity,Cpu,Zap,ShieldCheck];
const workflowStages=["Read online conditions","Validate plant values","Prepare model features","Calculate baseline","Create AI candidates","Run production model","Calculate six KPIs","Build reports"];
const stageDisplayMs=550;
const conditionRows:{key:Exclude<keyof ResearchPoint,"paired">;label:string;unit:string;digits:number}[]=[
  {key:"hrtHours",label:"HRT",unit:"hours",digits:2},
  {key:"temperature",label:"Temperature",unit:"°C",digits:1},
  {key:"ph",label:"pH",unit:"",digits:2},
  {key:"olr",label:"Organic loading",unit:"kg VS/m³/day",digits:2},
  {key:"feedRate",label:"Feed rate",unit:"kg VS/day",digits:1},
];

export default function ResearchProcessMonitor({result,busy,canRun=true,onRun,onAudit}:Props){
  const [selectedStage,setSelectedStage]=useState(0);
  const [playbackStage,setPlaybackStage]=useState<number|null>(null),[workflowError,setWorkflowError]=useState(false);
  const mounted=useRef(true),workflowActive=useRef(false);
  const playing=playbackStage!==null;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(!playing)return;
    const timer=setInterval(()=>setPlaybackStage(stage=>stage===null?null:Math.min(stage+1,workflowStages.length-1)),stageDisplayMs);
    return()=>clearInterval(timer);
  },[playing]);
  async function runWorkflow(){
    if(busy||!canRun||workflowActive.current)return;
    workflowActive.current=true;setWorkflowError(false);setPlaybackStage(0);
    try{const next=await onRun(workflowStages.length*stageDisplayMs);if(mounted.current){setWorkflowError(!next);if(next)setSelectedStage(workflowStages.length-1);}}
    catch{if(mounted.current)setWorkflowError(true);}
    finally{workflowActive.current=false;if(mounted.current)setPlaybackStage(null);}
  }
  const current=result?.comparison,selected=result?.selected;
  const activeStage=Math.min(selectedStage,workflowStages.length-1);
  const displayPoint=result?.pairedComparison||result?.workbookBaseline?selected:current;
  const stability=displayPoint?.stabilityPct;
  const ringStyle={"--rpm-index":`${Math.max(0,Math.min(100,stability??0))*3.6}deg`} as CSSProperties;
  const traceDetails=result?.pairedComparison?result.trace:result?[
    "The operating conditions are modelled from the synthetic workbook. No live IoT sensor is connected.",
    "The backend validates the supplied study values, explicit HRT units and supported model bounds. It does not validate live plant readings.",
    result.workbookBaseline?"Model features are prepared for each candidate HRT; no baseline HRT is supplied by the workbook.":result.scenario?.mode==="automatic"?`A new HRT input of ${number(current?.hrtHours,2)} hours was generated with a saved replay seed and transformed into fitted model features.`:`The entered comparison HRT of ${number(current?.hrtHours,2)} hours was transformed into fitted model features.`,
    result.workbookBaseline?`The supplied workbook biogas baseline is ${number(result.workbookBaseline.biogasM3Day)} m³/day. The separate energy study calculates its baseline from the model at 2-hour HRT.`:`The fitted ${result.modelVersion} model calculates the current scenario at ${number(current?.hrtHours,2)} hours.`,
    `${number(result.candidateCount,0)} candidate HRT values were generated for the requested goal. They are model evaluations, not training measurements.`,
    "The fitted production model evaluates the candidates along one synthetic process trajectory.",
    result.workbookBaseline?`The selected scenario predicts ${number(selected?.biogasM3Day)} m³/day biogas (+${number(result.workbookBaseline.selectedGainPct,2)}% vs workbook baseline). The independent energy study selects ${number(result.energyComparison?.selected.hrtHours,2)} h with +${number(result.energyComparison?.electricityGainPct,2)}% methane/electricity versus its modelled 2-hour baseline; its biogas change is ${number(result.energyComparison?.biogasChangePct,2)}%.`:result.jointImprovement?.status==="NO_JOINT_IMPROVEMENT"?"Biogas, methane and electricity do not jointly improve, so current modelled output is retained.":`The selected scenario predicts ${number(selected?.biogasM3Day)} m³/day biogas and ${number(selected?.electricityKwhDay)} kWh/day electricity, compared with ${number(current?.biogasM3Day)} and ${number(current?.electricityKwhDay)} at the current HRT.`,
    "The backend saves the result and fingerprints the model, source data, request and outputs for reports and audit replay.",
  ]:[];
  const equipment=[
    {title:"Feed preparation",Icon:Droplets,label:"Modelled feed rate",value:number(displayPoint?.feedRate),unit:"kg VS/day",detail:"Feed pump and inlet sensors"},
    {title:"Anaerobic digestion",Icon:Factory,label:"Modelled retention time",value:number(displayPoint?.hrtHours,2),unit:"hours",detail:"Digester, mixer and temperature sensors"},
    {title:"Gas conditioning",Icon:Flame,label:"Estimated H₂S after treatment",value:number(displayPoint?.h2sAfterPpm),unit:"ppm",detail:"Gas analyser and treatment equipment"},
    {title:"Electricity generation",Icon:Zap,label:"Predicted electricity potential",value:number(displayPoint?.electricityKwhDay),unit:"kWh/day",detail:"Generator and electricity meter"},
  ];

  return <div className="rpm-workspace">
    <section className="rpm-panel rpm-trace" aria-label="Backend execution trace">
      <header><div><span className="rpm-eyebrow">MODEL WORKFLOW VISUALIZATION</span><h2>AI Execution Workflow</h2><p>One stage at a time: online conditions → prediction model → KPI outputs → reports.</p></div><div className="rpm-trace-actions"><button type="button" className="rpm-run" onClick={()=>void runWorkflow()} disabled={busy||playing||!canRun}>{playing?<LoaderCircle className="rpm-spin" size={17}/>:<Play size={17}/>} {playing?"Running AI workflow…":"Run AI workflow"}</button><span className="rpm-trace-status">{playing?`0${playbackStage+1} of 08`:busy?"Waiting for backend response":result?"08 of 08 complete":"Ready to run"}</span></div></header>
      <div className="rpm-progress" aria-hidden="true"><span style={{width:`${playing?((playbackStage+1)/workflowStages.length)*100:result?100:0}%`}}/></div>
      <div className="rpm-online"><span><i/>Online Reading</span><b>Simulated Operating Conditions</b><small>IoT sensors can connect in a future deployment.</small></div>
      {workflowError&&<p className="rpm-workflow-error" role="alert">The workflow could not complete. Check the error above and try again.</p>}
      {playing?<>
        <div className="rpm-stage-grid" aria-label="Workflow visualization">{workflowStages.map((label,index)=>{const Icon=stageIcons[index]??Cpu;const state=index===playbackStage?"active":index<playbackStage?"shown":"waiting";return <div key={label} className={`rpm-stage rpm-workflow-stage${state==="active"?" selected":""}`} data-state={state} aria-current={state==="active"?"step":undefined}><span className="rpm-stage-number">0{index+1}{state==="active"?<LoaderCircle className="rpm-spin" size={16}/>:state==="shown"?<CheckCircle2 size={16}/>:<Clock3 size={16}/>}</span><Icon size={25}/><strong>{label}</strong><span className="rpm-stage-link">{state==="active"?"Processing…":state==="shown"?"Step shown":"Up next"}</span></div>;})}</div>
        <div className="rpm-stage-detail" role="status"><span className="rpm-stage-detail-icon"><LoaderCircle className="rpm-spin" size={24}/></span><div><span>VISUAL STAGE {playbackStage+1} OF {workflowStages.length}</span><h3>{workflowStages[playbackStage]}</h3><p>{playbackStage===workflowStages.length-1?"Finishing the workflow. Results appear after the backend response is received.":"Following the model workflow from scenario inputs to production results."}</p></div></div>
      </>:busy?<div className="rpm-pending" role="status"><Cpu size={32}/><h3>Calculation in progress</h3><p>Completed stages will appear when the backend returns its result. No stage progress is assumed while waiting.</p></div>:result?<>
        <div className="rpm-stage-grid">{workflowStages.map((label,index)=>{const Icon=stageIcons[index]??Cpu;return <button type="button" key={`${index}-${label}`} className={`rpm-stage${activeStage===index?" selected":""}`} aria-pressed={activeStage===index} aria-controls="rpm-stage-detail" onClick={()=>setSelectedStage(index)}><span className="rpm-stage-number">0{index+1}<CheckCircle2 size={18}/></span><Icon size={29}/><strong>{label}</strong><span className="rpm-stage-link"><CheckCircle2 size={17}/> Completed</span></button>;})}</div>
        <div className="rpm-stage-detail" id="rpm-stage-detail" aria-live="polite"><span className="rpm-stage-detail-icon"><CheckCircle2 size={24}/></span><div><span>COMPLETED STAGE {activeStage+1}</span><h3>{workflowStages[activeStage]}</h3><p>{traceDetails[activeStage]}</p></div></div>
        <div className="rpm-trace-footer"><p><Clock3 size={17}/>Total calculation time: <strong>{number(result.elapsedMs,1)} ms</strong><span>Reported by the backend</span></p><button type="button" onClick={()=>onAudit(result.runId)} disabled={!result.audit.saved}><ShieldCheck size={16}/>{result.audit.saved?"Open saved audit record":"Audit record not saved"}<ArrowRight size={15}/></button></div>
      </>:<div className="rpm-pending"><Cpu size={34}/><h3>No execution trace yet</h3><p>Select Run AI workflow to follow the stages and inspect the calculated results and saved audit evidence.</p></div>}
    </section>

    <section className="rpm-execution-hero" aria-label="Model execution overview">
      <div className="rpm-hero-heading"><div><span className="rpm-eyebrow">PROCESS MONITOR</span><h2>Model run status</h2><p>Inspect the calculated result and its modelled process estimates.</p></div><span className="rpm-disconnected"><Unplug size={17}/>IoT sensors: Not connected</span></div>
      <div className="rpm-hero-stats">
        <div><Cpu size={21}/><span>Backend state</span><strong>{busy?"Calculating":result?.jointImprovement?.status==="NO_JOINT_IMPROVEMENT"?"No joint improvement":result?"Calculation complete":"Ready to run"}</strong></div>
        <div><Database size={21}/><span>Evaluated scenarios</span><strong>{result?number(result.candidateCount,0):"—"}</strong></div>
        <div><Clock3 size={21}/><span>Calculation duration</span><strong>{result?`${number(result.elapsedMs,1)} ms`:"—"}</strong></div>
        <div><ShieldCheck size={21}/><span>Audit storage</span><strong>{result?result.audit.status:"No completed run"}</strong></div>
      </div>
      <div className="rpm-hero-actions"><p>{busy?(result?"A new backend calculation is running. Values below belong to the previous completed run.":"The backend is calculating the first scenario. Results will appear when the calculation completes."):result?`Completed ${new Date(result.createdAt).toLocaleString()} · Run ${result.runId.slice(0,8)}`:"Run the model to populate this view with its calculated results."}</p><button className="rpm-run" onClick={()=>void onRun()} disabled={busy||playing||!canRun}><Play size={17}/>{busy?"Calculating…":"Run AI optimization"}</button></div>
    </section>

    <section className="rpm-panel rpm-process" aria-label="Process equipment overview">
      <header><div><span className="rpm-eyebrow">PROCESS VIEW</span><h2>From feedstock to electricity</h2><p>{busy&&result?"Previous completed scenario estimates":result?.workbookBaseline?"Biogas study operating point estimates":"Current scenario estimates"} · equipment telemetry is unavailable</p></div><span className="rpm-model-label"><FlaskConical size={16}/>Model estimates</span></header>
      <div className="rpm-equipment-flow">{equipment.map(({title,Icon,label,value,unit,detail},index)=><article className="rpm-equipment" key={title}>
        <div className="rpm-equipment-top"><span className="rpm-equipment-icon"><Icon size={28}/></span><span className="rpm-equipment-number">0{index+1}</span></div>
        <h3>{title}</h3><span className="rpm-device-status"><Unplug size={13}/>NOT CONNECTED</span>
        <div className="rpm-equipment-value"><span>{label}</span><strong>{value} <small>{unit}</small></strong></div>
        <p>{detail}</p><footer>Sensor readings unavailable</footer>{index<equipment.length-1&&<ArrowRight className="rpm-flow-arrow" size={20}/>}</article>)}</div>
      <p className="rpm-panel-note">These values come from the fitted synthetic model. No live device measurements or equipment commands are available.</p>
    </section>

    <div className="rpm-analysis-grid">
      <section className="rpm-panel rpm-conditions" aria-label="Current and AI selected process conditions">
        <header><div><h2>Process conditions</h2><p>{result?.jointImprovement?.status==="NO_JOINT_IMPROVEMENT"?"Current scenario retained; no joint improvement":"Current scenario and AI selected recommendation"}</p></div><SlidersHorizontal size={22}/></header>
        <div className="rpm-table-scroll"><table><thead><tr><th>Parameter</th><th>Current scenario</th><th>AI selected</th></tr></thead><tbody>{conditionRows.map(row=><tr key={row.key}><th scope="row">{row.label}</th><td>{number(result?.pairedComparison&&row.key!=="hrtHours"?null:current?.[row.key],row.digits)} <span>{row.unit}</span></td><td>{number(selected?.[row.key],row.digits)} <span>{row.unit}</span></td></tr>)}</tbody></table></div>
        <p className="rpm-panel-note">{result?.pairedComparison?.sameTank?"Selected values are stage-specific model inputs. BEFORE HRT and production are preserved from the source file. Unprovided baseline temperature, pH, feed and loading are unavailable.":result?.pairedComparison?"Selected values are model inputs. The baseline depends only on HRT; matching untreated operating conditions are unavailable.":"Temperature, pH, feed rate and loading vary together along the workbook trajectory. Their independent control effects are not established."}</p>
      </section>
      <section className="rpm-panel rpm-stability" aria-label="Synthetic workbook stability index">
        <header><div><h2>Workbook stability index</h2><p>{result?.workbookBaseline?"AI selected scenario":"Current scenario"} · synthetic model estimate</p></div><Activity size={23}/></header>
        <div className="rpm-stability-content"><div className="rpm-index-ring" style={ringStyle}><div><strong>{number(stability,1)}</strong><span>out of 100</span></div></div><div className="rpm-stability-text"><h3>Modelled process index</h3><p>{result?.pairedComparison?"The retrained production model does not predict stability or H₂S. These values remain unavailable; no confidence or safety score is inferred.":"The source workbook supplies this index. It is not a calibrated safety rating or prediction confidence."}</p><dl><div><dt>Current HRT</dt><dd>{number(current?.hrtHours,2)} hours</dd></div><div><dt>AI selected index</dt><dd>{number(selected?.stabilityPct,1)} / 100</dd></div><div><dt>Live sensor status</dt><dd>Unavailable</dd></div></dl></div></div>
      </section>
    </div>

    {result&&<details className="rpm-identifiers"><summary><ShieldCheck size={18}/>Actual backend trace and audit identifiers</summary><ol className="rpm-backend-events">{result.trace.map((event,index)=><li key={`${index}-${event}`}>{event}</li>)}</ol><dl><div><dt>Run ID</dt><dd>{result.runId}</dd></div><div><dt>Model version</dt><dd>{result.modelVersion}</dd></div><div><dt>Model artifact</dt><dd>{result.artifactHash}</dd></div><div><dt>Source dataset</dt><dd>{result.dataHash}</dd></div><div><dt>Output fingerprint</dt><dd>{result.outputHash}</dd></div></dl><p>Saved records use SHA-256 and server-held HMAC authentication. These checks verify software evidence, not measured plant performance.</p></details>}
  </div>;
}
