"use client";
import {illustrativeComparison,type DemoBaseline} from "../lib/illustrative-comparison";
import "./illustrative-comparison.css";

const metrics=[
  {key:"biogasM3Day",label:"Biogas",unit:"m³/day"},
  {key:"methaneM3Day",label:"Methane",unit:"m³ CH₄/day"},
  {key:"electricityKwhDay",label:"Electricity",unit:"kWh/day"},
] as const;
const n=(value:number)=>value.toLocaleString(undefined,{maximumFractionDigits:2});

export default function IllustrativeComparison({baseline,runId,failed=false,period="day"}:{baseline:DemoBaseline|null;runId:string;failed?:boolean;period?:"day"|"year"}){
  const demo=illustrativeComparison(baseline,runId);if(!demo)return null;
  const days=period==="year"?365:1;
  return <section className="ic-demo" aria-label="Simulated comparison" data-source-run-id={runId} data-reason={failed?"run-failed":"presentation"} data-gain-pct={demo.assumedGainPct} data-period={period}>
    <header><div><span className="ic-badge">SIMULATED RESULTS</span><h2>AI optimized vs baseline</h2></div><b className="ic-assumption">+{n(demo.assumedGainPct)}%</b></header>
    <p>{failed?"The latest calculation failed. This comparison retains the sample from the last completed run.":"A generated 5–10% scenario for this run, separate from the trained-model predictions."}</p>
    <div className="ic-metrics">{metrics.map(metric=><article key={metric.key} data-demo-metric={metric.key}>
      <h3>{metric.label} <small>{metric.unit.replace("/day",`/${period}`)}</small></h3>
      <div className="ic-values"><div><span>Baseline</span><strong data-baseline-value>{n(demo.baseline[metric.key]*days)}</strong></div><span aria-hidden="true">→</span><div><span>AI optimized</span><strong data-demo-value>{n(demo.illustrative[metric.key]*days)}</strong></div></div>
      <div className="ic-bars" aria-hidden="true"><i style={{width:`${100/(1+demo.assumedGainPct/100)}%`}}/><i/></div><b className="ic-gain">+{n((demo.illustrative[metric.key]-demo.baseline[metric.key])*days)} {metric.unit.replace("/day",`/${period}`)} · +{n(demo.assumedGainPct)}%</b>
    </article>)}</div>
    <footer>Baseline: {n(demo.baseline.hrtHours)} hours · source run {runId.slice(0,8)}.{period==="year"?" Annual totals use 365 days.":""} Actual model results remain below. This simulation is excluded from model exports and audit verification.</footer>
  </section>;
}
