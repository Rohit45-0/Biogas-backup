"use client";
import {useState} from "react";
import type {ResearchResult} from "../lib/hrt-research-execution";
import ProductionHrtChart from "./ProductionHrtChart";
import {PairedScenarioDetails} from "./PairedScenarioStudy";
import type {ProductionHrtMetric} from "../lib/production-hrt-chart";
export default function SameTankAuditCharts({result}:{result:ResearchResult}){
  const [metric,setMetric]=useState<ProductionHrtMetric>("biogasM3Day");
  const pair=result.pairedComparison,study=pair?.sameTank;
  if(!pair||!study)return null;
  return <div className="same-tank-audit"><h4>Saved model logic and source pairing</h4><ol>{result.trace.map(step=><li key={step}>{step}</li>)}</ol><p>Training features: stage, AFTER HRT, temperature, pH and SRT. Fitted Ridge model; 400 development / 100 held-out records, final fit on all 500. IDs and output columns are excluded from features.</p><p>Source: {study.sourceFile} · {study.sourceSheet} · BEFORE row {study.baselineSourceRow}. Generated AFTER inputs use source scenarios {pair.input.parentA} and {pair.input.parentB}, interpolation weight {pair.input.weightB.toFixed(6)}. The model predicts outputs after input generation.</p><p>Source parent AFTER HRT: {study.sourceAfterHrtHours} h; generated candidate AFTER HRT: {result.selected.hrtHours.toFixed(4)} h. Source values and predictions are separate.</p><div className="hr-table-scroll"><table><thead><tr><th>Held-out output</th><th>MAE</th><th>R²</th></tr></thead><tbody>{Object.entries(pair.validation).map(([key,value])=><tr key={key}><td>{key}</td><td>{value.mae.toFixed(3)}</td><td>{value.r2.toFixed(3)}</td></tr>)}</tbody></table></div><div className="at-actions" role="group" aria-label="Saved same-tank graph">{([['biogasM3Day','Biogas'],['methaneM3Day','Methane'],['electricityKwhDay','Electricity']] as const).map(([key,label])=><button key={key} aria-pressed={metric===key} onClick={()=>setMetric(key)}>{label} vs HRT</button>)}</div><ProductionHrtChart result={result} metric={metric}/><PairedScenarioDetails result={result}/></div>;
}
