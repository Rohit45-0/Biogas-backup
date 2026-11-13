"use client";

import {useState} from "react";
import type {ResearchResult} from "../lib/hrt-research-execution";
import {illustrativeComparison} from "../lib/illustrative-comparison";
import "./electricity-bar-comparison.css";
import {productionBaseline,selectedProduction} from "../lib/workbook-comparison";

type Period="day"|"month"|"year";
type Metric="biogasM3Day"|"methaneM3Day"|"electricityKwhDay";
const metrics={biogasM3Day:{name:"Biogas",unit:"m³",title:"biogas production"},methaneM3Day:{name:"Methane",unit:"m³ CH₄",title:"methane production"},electricityKwhDay:{name:"Electricity",unit:"kWh",title:"electricity potential"}};
const format=(value:number,digits=1)=>value.toLocaleString(undefined,{maximumFractionDigits:digits});
function tickStep(value:number){
 const magnitude=10**Math.floor(Math.log10(Math.max(value,1))),normal=value/magnitude;
 return (normal<=1?1:normal<=2?2:normal<=2.5?2.5:normal<=5?5:10)*magnitude;
}

export default function ProductionBarComparison({result,period,metric}:{result:ResearchResult;period:Period;metric:Metric}){
 const [source,setSource]=useState<"simulated"|"model">("simulated");
 const paired=result.pairedComparison;
 const simulation=paired?null:illustrativeComparison(result.comparison,result.runId),simulated=source==="simulated"&&simulation!==null,info=metrics[metric];
 const energy=metric!=="biogasM3Day"?result.energyComparison:null;
 const baselineLabel=paired?"Baseline":energy?"Model baseline · 2 h":result.workbookBaseline?"Workbook baseline":simulated?"Baseline":"Current";
 const factor=period==="year"?365:period==="month"?30:1;
 const unit=`${info.unit}/${period}`;
 const periodLabel=period==="year"?"365-day":period==="month"?"30-day":"Daily";
 const baseline=productionBaseline(result)?.[metric]??null;
 const current=baseline===null?null:baseline*factor;
 const selected=(simulated?simulation.illustrative[metric]:selectedProduction(result)[metric])*factor;
 const noImprovement=!simulated&&result.jointImprovement?.status==="NO_JOINT_IMPROVEMENT";
 const difference=current===null?null:selected-current;
 const gainPct=current===null||current<=0?null:(selected/current-1)*100;
 const step=tickStep(Math.max(current??0,selected,1)/6),axisMax=Math.max(step,Math.ceil(Math.max(current??0,selected,1)/step)*step);
 const selectedLabel=paired||energy?"AI optimized":result.workbookBaseline?(metric==="biogasM3Day"?"AI optimized":"AI predicted"):simulated?"AI optimized":noImprovement?"Current retained":"AI selected";
 return <div className="eb-comparison" data-metric={metric} data-period={period} data-source={simulated?"simulated":"model"} data-study={paired?"planning-simulation":undefined} data-gain-pct={gainPct??undefined} data-outcome={noImprovement?"no-improvement":difference!==null&&difference>0?"up":difference!==null&&difference<0?"down":"flat"}>
  {!paired&&!result.workbookBaseline&&<div className="eb-source-controls" role="group" aria-label="Chart result source"><button aria-pressed={simulated} disabled={!simulation} onClick={()=>setSource("simulated")}>Simulated comparison</button><button aria-pressed={!simulated} onClick={()=>setSource("model")}>Model results</button></div>}
  <div className="eb-heading"><div><span>{simulated||paired&&!paired.sameTank?"SIMULATED RESULTS":"MODEL RESULTS"} · {period==="year"?"ANNUAL PROJECTION COMPARISON":"PRODUCTION COMPARISON"}</span><h3>{periodLabel} {info.title} · {unit}</h3><p>{simulated?`The same generated +${format(simulation.assumedGainPct,2)}% scenario shown in the comparison panel.`:paired?`Model-predicted ${gainPct!==null&&gainPct>=0?"+":""}${format(gainPct??0,2)}% change for the selected scenario, compared with its baseline.`:energy?`Energy-focused model comparison: 2 h baseline → ${format(energy.selected.hrtHours,2)} h selected. Biogas changes ${format(energy.biogasChangePct,2)}% in this energy study.`:result.workbookBaseline?(metric==="biogasM3Day"?"Compare the supplied workbook baseline with the selected model scenario.":"Selected model prediction. The workbook does not supply this output’s baseline, so its percentage gain is unavailable."):`Compare modelled ${info.name.toLowerCase()} from the current scenario and the AI selection.`}</p></div><strong className={noImprovement?"eb-neutral":""}>{difference===null?"Comparison unavailable":noImprovement?"No joint improvement":<>{gainPct!==null&&<span>{gainPct>=0?"+":""}{format(gainPct,2)}% vs baseline</span>}<small>{difference>=0?"+":""}{format(difference,2)} {unit}</small></>}</strong></div>
  <div className="eb-values"><div><small>{baselineLabel} {info.name.toLowerCase()}</small><b data-value="current">{current===null?"—":format(current)} <em>{unit}</em></b></div><div><small>{selectedLabel} {info.name.toLowerCase()}</small><b data-value="selected">{format(selected)} <em>{unit}</em></b></div><div><small>Change vs baseline</small><b data-value="gain">{gainPct===null?"—":`${gainPct>=0?"+":""}${format(gainPct,2)}`} <em>%</em></b></div></div>
  <div className="eb-fluid-chart" role="img" aria-label={`${info.name}: ${selectedLabel} ${format(selected)} ${unit}; baseline ${current===null?"unavailable":format(current)} ${unit}. Shared zero-based scale.`}>
    <div className="eb-plot-grid" aria-hidden="true"/>
    {[{key:"selected",label:selectedLabel,value:selected},{key:"baseline",label:paired?"Baseline":energy?"2 h model baseline":result.workbookBaseline?"Workbook baseline":"Baseline",value:current}].map(row=><div className="eb-fluid-row" key={row.key} data-bar={row.key} data-value={row.value??undefined}>
      <div className="eb-fluid-label"><span>{row.label}</span></div>
      <div className="eb-fluid-track">{row.value!==null&&<div className={`eb-fluid-fill eb-fill-${row.key}`} style={{width:`${Math.max(0,row.value/axisMax*100)}%`}}/>}<b className="eb-fluid-bar-value" style={{left:`calc(${Math.max(0,(row.value??0)/axisMax*100)}% + 10px)`}}>{row.value===null?"—":format(row.value)} <small>{unit}</small></b></div>
    </div>)}
    <div className="eb-fluid-axis" aria-hidden="true">{Array.from({length:5},(_,i)=><span key={i}>{new Intl.NumberFormat(undefined,{notation:"compact",maximumFractionDigits:1}).format(axisMax*i/4)}</span>)}</div>
    <p className="eb-axis-unit">{unit} · scale starts at 0</p>
  </div>
  <p className="eb-note">{simulated?"Generated simulation; use Model results to see the trained-model calculation. This comparison is not part of the model audit record. ":paired?.sameTank?`Same-tank model prediction · ${paired.input.id}. Source BEFORE HRT ${format(paired.sameTank.baselineHrtHours,2)} h → selected AFTER HRT ${format(result.selected.hrtHours,2)} h. Stage ${paired.sameTank.stage}; the stated feed and retrofit conditions apply. `:paired?`Trained-model prediction from planning simulation data · ${paired.input.id}. Baseline: HRT model at ${format(paired.input.hrtHours,2)} h. Exploratory cross-model comparison. `:"Trained-model calculation from the saved run. "}Projection only: {factor} operating {period==="day"?"day":"days"} at constant daily output. No downtime or seasonal adjustment is included. Values are not measured plant history.</p>
 </div>;
}
