"use client";
import {Fragment,useEffect,useState} from "react";
import type {researchMetadata} from "../lib/hrt-research";
import type {ResearchResult} from "../lib/hrt-research-execution";
import ComparisonBasis from "./ComparisonBasis";
import "./paired-scenario-study.css";
const n=(value:number|null|undefined,digits=2)=>value==null?"—":value.toLocaleString(undefined,{maximumFractionDigits:digits});
const comparisonOutputs=[
  {key:"biogasM3Day",label:"Biogas",unit:"m³/day"},
  {key:"methaneM3Day",label:"Methane",unit:"m³ CH₄/day"},
  {key:"electricityKwhDay",label:"Electricity",unit:"kWh/day"},
] as const;

export function PairedScenarioDetails({result}:{result:ResearchResult|null}){
  const pair=result?.pairedComparison;
  if(!result||!pair)return <section className="hr-panel"><header><h2>Input-based AI optimization</h2></header><p className="hr-footnote">Run AI optimization to evaluate 2,000 inputs. Candidates with more than 40% predicted gain in biogas, methane and electricity are prioritized.</p></section>;
  return <>
    <ComparisonBasis result={result}/>
    <section className="hr-panel"><header><div><h2>Selected operating input · {pair.input.id}</h2><p>{pair.input.pathway} · {pair.input.intervention}</p></div></header>
      <div className="hr-table-scroll"><table><thead><tr><th>HRT</th><th>Temperature</th><th>pH</th><th>{pair.sameTank?"SRT (days)":"Feed rate"}</th><th>{pair.sameTank?"Feed requirement":"Organic loading"}</th></tr></thead><tbody><tr><td>{n(pair.input.hrtHours)} hours</td><td>{n(pair.input.temperature)} °C</td><td>{n(pair.input.ph)}</td><td>{pair.sameTank?n(pair.input.srtDays):`${n(pair.input.feedRate)} kg VS/day`}</td><td>{pair.sameTank?pair.sameTank.feedRequirements.join(", "):`${n(pair.input.olr)} kg VS/m³/day`}</td></tr></tbody></table></div>
      <p className="hr-footnote">{pair.qualifyingCount.toLocaleString()} / 2,000 candidates exceed 40% in every output{pair.sameTank?` within stage ${pair.sameTank.stage}`:""}. {pair.thresholdMet?"This run selects from that group.":"No qualifying candidate was found; the best available comparison is shown."} The model is trained on {pair.trainingRows} source rows. Reusing the same input gives the same prediction.</p>
      <p className="hr-footnote">{pair.input.kind==="source_input"?`Source workbook input: scenario ${pair.input.parentA}.`:`Input interpolated between same-pathway source scenarios ${pair.input.parentA} and ${pair.input.parentB}.`} {pair.sameTank?`BEFORE HRT ${n(pair.sameTank.baselineHrtHours)} h; source sheet row ${pair.sameTank.baselineSourceRow}. AFTER input SRT ${n(pair.input.srtDays)} days. The baseline is read from the named BEFORE columns.`:"The baseline uses this HRT; untreated temperature, pH, feed and loading responses are not available."}</p>
    </section>
    <section className="hr-panel"><header><div><small>BACKEND MODEL EVALUATIONS</small><h2>Scenario comparison</h2><p>Selected input first, followed by the highest minimum gain across all three outputs.</p><p>Daily model estimates: Before is the baseline; After is the AI prediction.</p></div>{result.audit?.saved&&<a className="hr-secondary" href={`/api/research/hrt?runId=${result.runId}&format=csv`} download>Export 2,000 evaluations</a>}</header>
      <div className="hr-table-scroll paired-scenario-scroll" role="region" aria-label="Scenario comparison values" tabIndex={0}>
        <table className="paired-scenario-table">
          <thead>
            <tr><th scope="col" rowSpan={2}>Input</th><th scope="col" rowSpan={2}>{pair.sameTank?"HRT before → after (h)":"HRT (h)"}</th>{comparisonOutputs.map(output=><th key={output.key} scope="colgroup" colSpan={3}>{output.label}<small>{output.unit}</small></th>)}</tr>
            <tr>{comparisonOutputs.map(output=><Fragment key={output.key}><th scope="col" className="paired-group-start">Before</th><th scope="col">After</th><th scope="col">Gain</th></Fragment>)}</tr>
          </thead>
          <tbody>{result.candidatePreview.map(point=>{
            const evidence=point.paired;if(!evidence)return null;
            return <tr key={evidence.input.id} className={pair.input.id===evidence.input.id?"selected":""}>
              <th scope="row">{evidence.input.id} · {evidence.input.pathway}</th><td>{pair.sameTank?`${n(evidence.baselineHrtHours)} → `:""}{n(point.hrtHours)}</td>
              {comparisonOutputs.map(output=><Fragment key={output.key}><td className="paired-group-start">{n(evidence.baseline[output.key])}</td><td className="paired-after">{n(point[output.key])}</td><td>{n(evidence.gains[output.key])}%</td></Fragment>)}
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  </>;
}

type Metadata=ReturnType<typeof researchMetadata>["paired"];
export function PairedSourceStudy({metadata,showRows=false}:{metadata:Metadata|undefined;showRows?:boolean}){
  const [rows,setRows]=useState<Record<string,string|number>[]>([]),[error,setError]=useState("");
  useEffect(()=>{if(!showRows)return;let active=true;fetch("/api/research/hrt?view=paired-data",{cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error("Source rows could not be loaded");return response.json();}).then(data=>{if(active)setRows(data.rows);}).catch(cause=>{if(active)setError(cause.message);});return()=>{active=false;};},[showRows]);
  if(!metadata)return <p className="hr-footnote">Loading model study…</p>;
  const columns=["Scenario","Pathway","HRT (h)","Temp (C)","pH","Feed (kg VS/d)","OLR (kg VS/m3/d)","BEFORE Biogas (m3/d)","AFTER Biogas (m3/d)","CH4 (%)"];
  return <>
    <section className="hr-panel"><header><div><small>ACTIVE TRAINING WORKBOOK</small><h2>{metadata.source.file}</h2><p>{metadata.source.sheet} · 200 planning simulation records · {metadata.modelDescription}</p></div></header><p className="hr-footnote">Each run evaluates 2,000 supported input vectors: 173 original inputs plus 1,827 same-pathway interpolations. Inputs beyond the baseline model’s 24-hour limit are excluded from the scenario pool. HRT coverage: {n(metadata.inputCoverage.min)}–{n(metadata.inputCoverage.max)} hours.</p><p className="hr-footnote">The workbook’s BEFORE values are constant. The dynamic baseline comes from the separate existing HRT model at each candidate’s HRT; it is not a learned untreated response to every operating input.</p></section>
    <section className="hr-panel"><header><div><h2>Held-out model evaluation</h2><p>{metadata.developmentRows} development rows, {metadata.testRows} held-out rows. The final model is fitted on all 200 after evaluation.</p></div></header><div className="hr-table-scroll"><table><thead><tr><th>Output</th><th>Mean absolute error</th><th>R²</th></tr></thead><tbody>{Object.entries(metadata.holdout).map(([key,value])=><tr key={key}><td>{key==="biogas_m3_day"?"Biogas · m³/day":key==="methane_m3_day"?"Methane · m³/day":"Electricity · kWh/day"}</td><td>{n(value.mae,3)}</td><td>{n(value.r2,4)}</td></tr>)}</tbody></table></div><p className="hr-footnote"><strong>Weak predictive validation:</strong> negative held-out R² means these predictions have not demonstrated accuracy beyond a mean benchmark. This is an exploratory planning study, not evidence of plant performance.</p><ul className="hr-footnote">{metadata.limitations.map(item=><li key={item}>{item}</li>)}</ul></section>
    {showRows&&<section className="hr-panel"><header><h2>Original 200 source records</h2></header>{error?<p role="alert" className="hr-footnote">{error}</p>:<div className="hr-table-scroll"><table><thead><tr>{columns.map(column=><th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.Scenario}>{columns.map(column=><td key={column}>{row[column]}</td>)}</tr>)}</tbody></table></div>}</section>}
  </>;
}
