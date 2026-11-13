"use client";
import StoredReportPicker from "./StoredReportPicker";

import {useEffect,useRef,useState} from "react";
import {ArrowUpRight,CheckCircle2,Download,FileText,History,Play,ShieldCheck,TriangleAlert} from "lucide-react";
import type {ResearchResult} from "../lib/hrt-research-execution";
import {researchResultIsConsistent} from "../lib/research-result-integrity";
import {researchImprovement,improvementPercent} from "../lib/research-improvement";
import {productionBaseline,selectedProduction} from "../lib/workbook-comparison";
import ComparisonBasis from "./ComparisonBasis";
import IllustrativeComparison from "./IllustrativeComparison";
import "./research-reports.css";

type Props={result:ResearchResult|null;history:ResearchResult[];busy:boolean;demoFailure?:ResearchResult|null;canRun?:boolean;onRun:()=>void;onAudit:(id:string)=>void};
type Verification={runId:string;status:string;saved:boolean;reportId:string;meaning:string;checks:{name:string;passed:boolean}[]};
type Period={label:string;days:number};
const months:Period[]=[{label:"January",days:31},{label:"February",days:28},{label:"March",days:31},{label:"April",days:30},{label:"May",days:31},{label:"June",days:30},{label:"July",days:31},{label:"August",days:31},{label:"September",days:30},{label:"October",days:31},{label:"November",days:30},{label:"December",days:31}];
const number=(value:number|null|undefined,digits=1)=>value===null||value===undefined?"—":value.toLocaleString(undefined,{maximumFractionDigits:digits});
const signed=(value:number|null)=>value===null?"—":`${value>0?"+":""}${number(value,2)}`;

function csvCell(value:unknown){
  let text=String(value??"");
  if(/^[=+@\t\r]/.test(text))text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}

export function researchProjectionCsv(run:ResearchResult,kind:"daily"|"monthly"){
  if(!researchResultIsConsistent(run))throw new Error("This historical report does not pass the current comparison checks. Generate a new report before exporting projections.");
  const periods:Period[]=kind==="monthly"?months:Array.from({length:365},(_,i)=>({label:`Day ${i+1}`,days:1}));
  const gains=researchImprovement(productionBaseline(run),selectedProduction(run)),baseline=productionBaseline(run);
  const columns=["modelled_period","days","comparison_biogas_m3","selected_biogas_m3","comparison_methane_m3","selected_methane_m3","comparison_electricity_kwh","selected_electricity_kwh","comparison_hrt_hours","selected_hrt_hours","optimization_status","selected_h2s_before_ppm","selected_h2s_after_ppm","run_id","model_version","model_artifact_sha256","saved_output_hash","audit_saved","projection_basis","export_authentication","ai_biogas_change_m3","ai_methane_change_m3","ai_electricity_change_kwh","ai_biogas_change_pct","ai_methane_change_pct","ai_electricity_change_pct","baseline_basis","energy_baseline_hrt_hours","energy_selected_hrt_hours","energy_baseline_basis","energy_study_biogas_change_pct","study_scope","candidate_id","pathway","selection_seed","input_pool_hash"];
  const rows=periods.map(period=>[
    period.label,period.days,baseline?.biogasM3Day==null?null:baseline.biogasM3Day*period.days,run.selected.biogasM3Day*period.days,
    baseline?.methaneM3Day==null?null:baseline.methaneM3Day*period.days,selectedProduction(run).methaneM3Day*period.days,
    baseline?.electricityKwhDay==null?null:baseline.electricityKwhDay*period.days,selectedProduction(run).electricityKwhDay*period.days,
    run.retentionTime.beforeHours,run.selected.hrtHours,run.jointImprovement?.status??"HISTORICAL_RUN",run.selected.h2sBeforePpm,run.selected.h2sAfterPpm,
    run.runId,run.modelVersion,run.artifactHash,run.outputHash,run.audit.saved,
    "constant_output_projection_365_day_year_not_measured_history",
    "client_calculated_projection_not_a_server_authenticated_export",
    ...gains.map(g=>g.change===null?null:g.change*period.days),...gains.map(g=>g.percent),run.pairedComparison?run.pairedComparison.basis:run.workbookBaseline?"workbook_biogas":"modelled_hrt",run.energyComparison?.baseline.hrtHours,run.energyComparison?.selected.hrtHours,run.energyComparison?.basis,run.energyComparison?.biogasChangePct,run.pairedComparison?.sameTank?"same_tank_source_before_model_after":run.pairedComparison?"same_input_cross_model_comparison":run.energyComparison?"separate_biogas_and_energy_operating_scenarios":"single_hrt_comparison",run.pairedComparison?.input.id,run.pairedComparison?.input.pathway,run.pairedComparison?.selectionSeed,run.pairedComparison?.poolHash,
  ]);
  return [columns,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n");
}

function downloadProjection(run:ResearchResult,kind:"daily"|"monthly"){
  const file=new Blob(["\ufeff",researchProjectionCsv(run,kind)],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(file),link=document.createElement("a");
  link.href=url;link.download=`aquaivolt-${run.runId}-${kind==="daily"?"daily":"12-month"}-projection.csv`;
  document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function ResearchReports({result,history,busy,demoFailure,canRun=true,onRun,onAudit}:Props){
  const [storedReports,setStoredReports]=useState<ResearchResult[]>([]);
  const [selection,setSelection]=useState({runId:"",latestRunId:""});
  const [verification,setVerification]=useState<Verification|null>(null),[verifying,setVerifying]=useState(false);
  const [error,setError]=useState<{runId:string;message:string}|null>(null);
  const activeVerification=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const selectedId=selection.latestRunId===(result?.runId??"")?selection.runId:"";
  const available=[...new Map([...(result?[result]:[]),...history,...storedReports].map(item=>[item.runId,item])).values()].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const saved=available.filter(item=>item.audit.saved);
  const run=available.find(item=>item.runId===selectedId)??result??available[0]??null;
  const baseline=run?productionBaseline(run):null;
  const reportIsCurrent=run?researchResultIsConsistent(run):false;
  const gains=run?researchImprovement(productionBaseline(run),selectedProduction(run)):[];
  const shownVerification=verification?.runId===run?.runId?verification:null;
  const shownError=error&&error.runId===run?.runId?error.message:"";

  async function verify(){
    if(!run?.audit.saved||activeVerification.current)return;
    const runId=run.runId;activeVerification.current=true;setVerifying(true);setError(null);
    try{
      const response=await fetch("/api/research/hrt/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({runId})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"The saved report could not be verified.");
      if(mounted.current)setVerification(data);
    }catch(cause){if(mounted.current)setError({runId,message:cause instanceof Error?cause.message:"The saved report could not be verified."});}
    finally{activeVerification.current=false;if(mounted.current)setVerifying(false);}
  }

  return <section className="rr-workspace" aria-label="AI and KPI reports">
    <header className="rr-heading"><div><p className="rr-eyebrow">AI + KPI REPORT</p><h2>Saved optimization results</h2><p>Every run keeps its current scenario, AI recommendation and export evidence together.</p></div><button className="rr-primary" onClick={onRun} disabled={busy||!canRun}><Play size={16}/>{busy?"Calculating…":"Generate new report"}</button></header>
    {run&&reportIsCurrent?<>
      {!run.pairedComparison&&!busy&&<IllustrativeComparison baseline={run.comparison} runId={run.runId} failed={demoFailure?.runId===run.runId} period="year"/>}
      {selectedId&&selectedId!==result?.runId&&<div className="rr-history-notice" role="status"><History size={17}/><span>Viewing saved run {run.runId.slice(0,8)} from {new Date(run.createdAt).toLocaleString()}.</span><button onClick={()=>{setSelection({runId:"",latestRunId:result?.runId??""});setError(null);}}>Return to latest run</button></div>}
      <ComparisonBasis result={run}/>
      <section className="rr-improvement" aria-label="AI improvement" data-outcome={run.jointImprovement.status}>
        <h3>AI improvement</h3><p>{run.pairedComparison?.sameTank?"All three outputs compare the source BEFORE values with the selected same-tank model prediction. HRT changes from the source BEFORE time to the selected AFTER time. Stage retrofit and feed conditions apply.":run.pairedComparison?"All three outputs compare the selected input’s HRT baseline with its retrained-model prediction. This is an exploratory comparison between two models.":run.energyComparison?"Biogas gain uses the workbook baseline. Methane and electricity gains use the separate 2-hour model baseline; each study has its own selected HRT.":run.workbookBaseline?"Biogas gain uses the supplied workbook baseline. Baseline methane and electricity are not supplied; their gains cannot be calculated.":"Change from the current scenario. AI output totals are shown separately below."}</p>
        <dl>{gains.map(gain=><div key={gain.key} data-metric={gain.key}><dt>{gain.label}</dt><dd>{improvementPercent(gain.percent)}</dd><small>{gain.annualChange===null?"Baseline not supplied":`${signed(gain.annualChange)} ${gain.unit}`}</small></div>)}</dl>
        {run.jointImprovement.status==="NO_JOINT_IMPROVEMENT"&&<p role="status"><strong>Current scenario retained.</strong> {run.jointImprovement.reason} Electricity is calculated from methane output. The AI improvement for this run is 0%.</p>}
      </section>
      <div className="rr-totals" aria-label="Yearly production projections">
        <article><span>{run.pairedComparison?"Yearly baseline methane":run.energyComparison?"Yearly model baseline methane · 2 h":run.workbookBaseline?"Yearly baseline methane · not supplied":"Yearly current methane"}</span><strong>{number(baseline?.methaneM3Day==null?null:baseline.methaneM3Day*365,0)}</strong><small>m³ CH₄/year</small></article>
        <article className={run.jointImprovement?.status==="NO_JOINT_IMPROVEMENT"?undefined:"rr-ai-total"}><span>Yearly AI optimized methane</span><strong>{number(selectedProduction(run).methaneM3Day*365,0)}</strong><small>m³ CH₄/year</small></article>
        <article><span>{run.pairedComparison?"Yearly baseline electricity":run.energyComparison?"Yearly model baseline electricity · 2 h":run.workbookBaseline?"Yearly baseline electricity · not supplied":"Yearly current electricity"}</span><strong>{number(baseline?.electricityKwhDay==null?null:baseline.electricityKwhDay*365,0)}</strong><small>kWh/year</small></article>
        <article className={run.jointImprovement?.status==="NO_JOINT_IMPROVEMENT"?undefined:"rr-ai-total"}><span>Yearly AI optimized electricity</span><strong>{number(selectedProduction(run).electricityKwhDay*365,0)}</strong><small>kWh/year</small></article>
      </div>
      <p className="rr-projection-note">Constant-output projections, not measured history. Totals assume 365 operating days at the saved daily estimates, with no downtime or seasonal adjustment.</p>
      <div className={`rr-recommendation${run.jointImprovement?.status==="NO_JOINT_IMPROVEMENT"?" rr-no-improvement":""}`}><div><span className="rr-eyebrow">{run.energyComparison?"BIOGAS STUDY OPERATING POINT":"AI SELECTED RECOMMENDATION"}</span><h3>{run.pairedComparison?.sameTank?`HRT ${number(run.comparison?.hrtHours,2)} → ${number(run.selected.hrtHours,2)} hours · ${run.pairedComparison.input.id}`:run.pairedComparison?`Input ${run.pairedComparison.input.id} · HRT ${number(run.selected.hrtHours,2)} hours`:run.workbookBaseline?`AI selected HRT: ${number(run.selected.hrtHours,2)} hours`:`HRT ${number(run.retentionTime.beforeHours,2)} → ${number(run.selected.hrtHours,2)} hours`}</h3><p>{!run.pairedComparison&&!run.workbookBaseline&&<>HRT change: {signed(run.retentionTime.changeHours)} hours ({run.retentionTime.direction}). </>}Selected output: <strong>{number(run.selected.biogasM3Day)} m³ biogas/day</strong>, {number(run.selected.methaneM3Day)} m³ CH₄/day and {number(run.selected.electricityKwhDay)} kWh/day.</p><p>Model estimates only. Plant performance remains to be validated.</p></div><dl><div><dt>Model evaluations</dt><dd>{number(run.candidateCount,0)}</dd></div><div><dt>Audit status</dt><dd className={run.audit.saved?"rr-success":"rr-warning"}>{run.audit.status}</dd></div></dl></div>
      <section className="rr-table-panel" aria-label="Twelve-month projection">
        <header><div><h3>12-month production projection</h3><p>365-day projection using calendar month lengths. {run.energyComparison&&"Biogas and energy columns use separate selected operating scenarios."}</p></div><span>{run.modelVersion}</span></header>
        <div className="rr-table-scroll" tabIndex={0} role="region" aria-label="Monthly scenario comparison table">
          <table><thead><tr><th scope="col">Modelled period</th><th scope="col">{run.pairedComparison?"Baseline biogas":run.workbookBaseline?"Workbook baseline biogas":"Current biogas"}<br/><small>m³</small></th><th scope="col">AI selected biogas<br/><small>m³</small></th><th scope="col">Baseline methane<br/><small>m³ CH₄</small></th><th scope="col">AI selected methane<br/><small>m³ CH₄{run.energyComparison?" · energy study":""}</small></th><th scope="col">Baseline electricity<br/><small>kWh</small></th><th scope="col">AI selected electricity<br/><small>kWh{run.energyComparison?" · energy study":""}</small></th><th scope="col">H₂S filter reduction<br/><small>ppm{run.energyComparison?" · biogas study":", model estimate"}</small></th></tr></thead>
            <tbody>{months.map(month=><tr key={month.label}><th scope="row">{month.label}<small>{month.days} days</small></th><td>{number(baseline?.biogasM3Day==null?null:baseline.biogasM3Day*month.days,0)}</td><td className={run.jointImprovement?.status==="NO_JOINT_IMPROVEMENT"?undefined:"rr-selected-value"}>{number(run.selected.biogasM3Day*month.days,0)}</td><td>{number(baseline?.methaneM3Day==null?null:baseline.methaneM3Day*month.days,0)}</td><td className={run.jointImprovement?.status==="NO_JOINT_IMPROVEMENT"?undefined:"rr-selected-value"}>{number(selectedProduction(run).methaneM3Day*month.days,0)}</td><td>{number(baseline?.electricityKwhDay==null?null:baseline.electricityKwhDay*month.days,0)}</td><td className={run.jointImprovement?.status==="NO_JOINT_IMPROVEMENT"?undefined:"rr-selected-value"}>{number(selectedProduction(run).electricityKwhDay*month.days,0)}</td><td>{number(run.selected.h2sBeforePpm===null||run.selected.h2sAfterPpm===null?null:run.selected.h2sBeforePpm-run.selected.h2sAfterPpm,1)}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="rr-table-note">{run.pairedComparison?"H₂S is not predicted by the retrained production model and is shown as unavailable.":"H₂S is the modelled before/after concentration difference for the selected scenario; it is not a monthly accumulated amount."} {run.pairedComparison?.sameTank?"All outputs and HRT use the same saved BEFORE / AFTER comparison. Source BEFORE rounding is preserved; annual values equal daily values × 365. Electricity is gross potential excluding unprovided retrofit costs.":run.pairedComparison?"All three outputs use the same selected candidate. Baseline production comes from the separate HRT-only model; AI predictions come from the 200-row multivariate model.":run.energyComparison?"Biogas uses the workbook reference and biogas-selected scenario; methane and electricity use the energy-selected scenario against its modelled 2-hour baseline. These are separate operating scenarios.":run.workbookBaseline?"Biogas baseline is the supplied workbook reference; methane and electricity are predictions without supplied baseline values.":run.jointImprovement?.status==="NO_JOINT_IMPROVEMENT"?"Current values are repeated because no jointly improving scenario was found.":run.comparison?"Current and AI selected columns use the same fitted hours model.":"The comparison HRT is outside model coverage, so current production is unavailable."}</p>
        <div className="rr-export-actions">
          {run.audit.saved&&<a href={`/api/research/hrt?runId=${run.runId}&format=csv`} download><Download size={16}/>Export 2,000 model evaluations</a>}
          <button onClick={()=>downloadProjection(run,"daily")}><Download size={16}/>Export daily projection</button>
          <button onClick={()=>downloadProjection(run,"monthly")}><Download size={16}/>Export 12-month projection</button>
        </div>
        <p className="rr-export-note">Projection CSVs are calculated in your browser from this run. The authenticated record and model-evaluation export remain available separately below.</p>
      </section>
      <section className="rr-evidence" aria-label="Report evidence">
        <header><div><ShieldCheck size={22}/><div><h3>Saved report evidence</h3><p>Server-authenticated audit exports use SHA-256 and server-held HMAC.</p></div></div><span className={run.audit.saved?"rr-success":"rr-warning"}>{run.audit.saved?"RECORD AVAILABLE":"STORAGE NOT CONFIRMED"}</span></header>
        <dl className="rr-identifiers"><div><dt>Run ID</dt><dd>{run.runId}</dd></div><div><dt>Created</dt><dd>{new Date(run.createdAt).toLocaleString()}</dd></div><div><dt>Model</dt><dd>{run.modelVersion}</dd></div></dl>
        <div className="rr-evidence-actions"><button disabled={!run.audit.saved||verifying} onClick={()=>void verify()}><ShieldCheck size={16}/>{verifying?"Verifying…":"Verify saved run"}</button>{run.audit.saved&&<><a href={`/api/audit?runId=${run.runId}&format=json`} download><Download size={16}/>Audit JSON</a><button onClick={()=>onAudit(run.runId)}>Open in Audit Trail <ArrowUpRight size={16}/></button></>}</div>
        <p className="rr-export-note">Server integrity checks are not independent public-key verification or proof of plant accuracy.</p>
        {shownError&&<div className="rr-error" role="alert"><TriangleAlert size={18}/>{shownError}</div>}
        {shownVerification&&<div className={`rr-verification${shownVerification.status==="PASS"?"":" rr-failed"}`} role="status"><h4>{shownVerification.status} · {shownVerification.checks.filter(item=>item.passed).length}/{shownVerification.checks.length} checks</h4><p>{shownVerification.meaning} {shownVerification.saved?"Verification report saved.":"Verification report was not saved."}</p><ul>{shownVerification.checks.map(item=><li key={item.name}>{item.passed?<CheckCircle2 size={16}/>:<TriangleAlert size={16}/>}<span>{item.name}</span></li>)}</ul></div>}
      </section>
    </>:run?<div className="rr-superseded" role="alert"><TriangleAlert size={28}/><div><h3>This saved report needs recalculation</h3><p>Its AI selection does not pass the current biogas, methane and electricity comparison checks. Its earlier numbers are hidden here to avoid presenting a lower output as an optimization. The original audit record remains available.</p><div><button className="rr-primary" disabled={busy||!canRun} onClick={onRun}><Play size={16}/>Generate corrected report</button><button onClick={()=>onAudit(run.runId)}>View original audit record <ArrowUpRight size={16}/></button></div></div></div>:<div className="rr-empty"><FileText size={36}/><h3>No report generated yet</h3><p>Run AI optimization to create a scenario comparison, production projections and retrievable audit evidence.</p><button className="rr-primary" disabled={busy||!canRun} onClick={onRun}><Play size={16}/>{busy?"Calculating…":"Generate first report"}</button></div>}
    <section className="rr-history" aria-label="Saved report history"><header><div><h3>Saved report history</h3><p>Reports loaded in this view. Use the server history below to reopen earlier runs.</p></div><span>{saved.length} {saved.length===1?"recorded run":"recorded runs"}</span></header>{saved.length?<ul>{saved.map(item=>{const consistent=researchResultIsConsistent(item);return <li key={item.runId} className={item.runId===run?.runId?"rr-active-report":""}><button className="rr-history-select" aria-pressed={item.runId===run?.runId} onClick={()=>{setSelection({runId:item.runId,latestRunId:result?.runId??""});setError(null);}}><History size={18}/><span><strong>{new Date(item.createdAt).toLocaleString()}</strong><small>Run {item.runId.slice(0,8)} · {number(item.candidateCount,0)} evaluations · {item.workbookBaseline?"Workbook baseline · ":`${number(item.retentionTime.beforeHours,2)} → `}{number(item.selected.hrtHours,2)} h</small></span></button><span className="rr-history-output">{consistent?number(item.selected.biogasM3Day):"Review"} <small>{!consistent?"Needs recalculation":`m³/day · AI improvement: ${improvementPercent(researchImprovement(productionBaseline(item),item.selected)[0].percent)}`}</small></span><a href={`/api/research/hrt?runId=${item.runId}&format=csv`} download aria-label={`Download model evaluations for run ${item.runId.slice(0,8)}`}><Download size={16}/>CSV</a><button onClick={()=>onAudit(item.runId)} aria-label={`Open evidence for run ${item.runId.slice(0,8)}`}>Evidence <ArrowUpRight size={15}/></button></li>;})}</ul>:<p className="rr-history-empty">A report appears here after its audit record is confirmed in storage.</p>}</section>
    {canRun&&<StoredReportPicker onLoad={item=>{setStoredReports(old=>[item,...old.filter(r=>r.runId!==item.runId)]);setSelection({runId:item.runId,latestRunId:result?.runId??""});}}/>}
  </section>;
}
