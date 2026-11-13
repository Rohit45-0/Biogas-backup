"use client";

import type {ResearchResult} from "../lib/hrt-research-execution";
import "./research-comparison-chart.css";

export type ComparisonMetric="biogasM3Day"|"methaneM3Day"|"electricityKwhDay"|"methanePct";
export type ComparisonPeriod="curve"|"day"|"month"|"year";

const metricInfo:Record<ComparisonMetric,{name:string;unit:string}>={
  biogasM3Day:{name:"Biogas",unit:"m³/day"},
  methaneM3Day:{name:"Methane",unit:"m³ CH₄/day"},
  electricityKwhDay:{name:"Electricity",unit:"kWh/day"},
  methanePct:{name:"Methane content",unit:"% CH₄"},
};
const format=(value:number,digits=1)=>value.toLocaleString(undefined,{maximumFractionDigits:digits});

export default function ResearchComparisonChart({result,metric,period="curve",ariaLabel}:{result:ResearchResult;metric:ComparisonMetric;period?:ComparisonPeriod;ariaLabel?:string}){
  const energy=metric!=="biogasM3Day"?result.energyComparison:null;
  const info=metricInfo[metric],current=energy?.baseline??result.comparison,selected=energy?.selected??result.selected;
  const factor=period==="month"?30:period==="year"?365:1;
  const unit=period==="curve"||metric==="methanePct"?info.unit:info.unit.replace("/day",`/${period}`);
  const currentValue=energy?energy.baseline[metric]*factor:result.workbookBaseline?(metric==="biogasM3Day"?result.workbookBaseline.biogasM3Day*factor:null):current?current[metric]*factor:null,selectedValue=selected[metric]*factor;
  const delta=currentValue===null?null:selectedValue-currentValue;
  const retained=result.jointImprovement?.status==="NO_JOINT_IMPROVEMENT";
  const outputDirection=retained||delta===null||Math.abs(delta)<1e-8?"flat":delta>0?"up":"down";
  const timeChange=current?selected.hrtHours-current.hrtHours:null;
  const timeDirection=retained||timeChange===null||Math.abs(timeChange)<1e-8?"flat":timeChange<0?"down":"up";
  const periodName=period==="month"?"30-day":period==="year"?"365-day":"daily";
  const subtitle=energy?`Energy study against the 2-hour model baseline. Biogas changes ${format(energy.biogasChangePct,2)}% in this study.`:result.workbookBaseline?(metric==="biogasM3Day"?"Higher predicted biogas against the supplied workbook baseline.":"Selected model output; a corresponding baseline is not supplied in the workbook."):retained?"No HRT improves biogas and methane together for this scenario. Current modelled output is retained.":outputDirection==="up"&&timeDirection==="down"?`Lower retention time with higher predicted ${info.name.toLowerCase()} output.`:outputDirection==="up"?`Higher predicted ${info.name.toLowerCase()} output at the selected HRT.`:outputDirection==="down"?`The selected HRT predicts less ${info.name.toLowerCase()} output.`:"Current and selected output are unchanged.";
  const values=result.curve.map(point=>point[metric]*factor);
  const min=Math.min(...values,currentValue??selectedValue,selectedValue),max=Math.max(...values,currentValue??selectedValue,selectedValue);
  const spread=Math.max(max-min,Math.abs(max)*.04,1),low=min-spread*.12,high=max+spread*.12;
  const width=940,height=338,left=72,right=30,top=28,bottom=54;
  const x=(hour:number)=>left+(hour-2)/22*(width-left-right);
  const y=(value:number)=>height-bottom-(value-low)/(high-low)*(height-top-bottom);
  const selectedX=x(selected.hrtHours),selectedY=y(selectedValue),currentX=current?x(current.hrtHours):null,currentY=currentValue===null?null:y(currentValue);
  const deltaX=Math.max(left+15,Math.min(width-right-15,selectedX+(selectedX<width/2?23:-23)));
  const selectedName=retained?"Current retained":"AI selected";
  const calloutToRight=selectedX<width*.54,greenWidth=212,redWidth=252,calloutHeight=34;
  const greenX=calloutToRight?Math.min(width-right-greenWidth-8,selectedX+22):Math.max(left+8,selectedX-greenWidth-22);
  const greenY=Math.max(4,selectedY-78);
  const redX=Math.max(left+8,Math.min(width-right-redWidth-8,greenX+(calloutToRight?22:-22)));
  const redY=selectedY<100?selectedY+23:greenY+41;
  const targetAchieved=result.request.objective==="target_hrt"&&typeof result.request.targetHours==="number"&&Math.abs(result.request.targetHours-selected.hrtHours)<.01;
  const timeCallout=timeDirection==="down"?targetAchieved?`Time target achieved: ${format(selected.hrtHours,2)} h`:`HRT decreases: ${format(Math.abs(timeChange!),2)} h`:timeDirection==="up"?`HRT increases: ${format(Math.abs(timeChange!),2)} h`:null;
  const note=period==="month"?"Monthly values use 30 days at constant modelled output.":period==="year"?"Yearly values use 365 days at constant modelled output.":"HRT is the model input; linked process conditions vary together along this synthetic trajectory.";

  return <div className="rc-comparison" data-outcome={retained?"no-improvement":outputDirection} data-period={period}>
    <div className="rc-intro"><div><span className="rc-kicker">{energy?"ENERGY STUDY · 2 H MODEL BASELINE":result.workbookBaseline?"WORKBOOK BASELINE VS AI MODEL":"CURRENT VS AI-SELECTED HRT"}</span><h3>{info.name} optimization: {energy?"model baseline vs AI optimized":result.workbookBaseline?"workbook baseline vs AI optimized":"current vs AI-selected HRT"}</h3><p>{subtitle}</p></div><span className="rc-period-tag">{period==="curve"?"HRT trajectory":`${periodName} projection`}</span></div>
    <div className="rc-signals" aria-label="Comparison summary">
      <span className={`rc-signal rc-signal-${outputDirection}`}>{outputDirection==="up"?"↑":outputDirection==="down"?"↓":"="} {retained?"No joint production gain":delta===null?"Run comparison unavailable":`${outputDirection==="up"?"+":""}${format(delta,2)} ${unit} ${info.name.toLowerCase()}`}</span>
      <span className={`rc-signal rc-signal-time-${timeDirection}`}>{timeDirection==="down"?"↓":timeDirection==="up"?"↑":"="} {timeChange===null?"Current HRT unavailable":timeDirection==="flat"?"HRT unchanged":`HRT ${timeDirection==="down"?"decreases":"increases"} ${format(Math.abs(timeChange),2)} h`}</span>
    </div>
    <div className="rc-highlights">
      <div className="rc-highlight rc-highlight-selected"><span>{selectedName} HRT</span><strong>{format(selected.hrtHours,2)} <small>h</small></strong></div>
      <div className="rc-highlight"><span>Current HRT</span><strong>{current?format(current.hrtHours,2):"—"} <small>h</small></strong></div>
      <div className="rc-highlight rc-highlight-selected"><span>{selectedName} {info.name.toLowerCase()}</span><strong data-value="selected">{format(selectedValue)} <small>{unit}</small></strong></div>
      <div className="rc-highlight"><span>{energy?"Model baseline (2 h)":result.workbookBaseline?"Workbook baseline":"Current"} {info.name.toLowerCase()}</span><strong data-value="current">{currentValue===null?"—":format(currentValue)} <small>{unit}</small></strong></div>
    </div>
    <div className="rc-graph-heading"><strong>{info.name} ({unit})</strong><span>Fitted synthetic model · HRT 2–24 h</span></div>
    <div className="rc-graph-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel??`${info.name} model curve versus HRT in hours`}>
      <title>{info.name} current versus AI-selected HRT</title><desc>{subtitle} Current {current?`${format(current.hrtHours,2)} hours and ${format(currentValue!)} ${unit}`:"unavailable"}; {selectedName.toLowerCase()} {format(selected.hrtHours,2)} hours and {format(selectedValue)} {unit}.</desc>
      {[0,.25,.5,.75,1].map(step=>{const value=low+(high-low)*step;return <g key={step}><line className="rc-grid" x1={left} x2={width-right} y1={y(value)} y2={y(value)}/><text className="rc-axis-label" x={left-12} y={y(value)+4} textAnchor="end">{format(value)}</text></g>;})}
      {[2,6,10,14,18,24].map(hour=><g key={hour}><line className="rc-tick" x1={x(hour)} x2={x(hour)} y1={height-bottom} y2={height-bottom+6}/><text className="rc-axis-label" x={x(hour)} y={height-20} textAnchor="middle">{hour} h</text></g>)}
      <line className="rc-axis" x1={left} x2={width-right} y1={height-bottom} y2={height-bottom}/>
      {currentY!==null&&<line className="rc-baseline" x1={left} x2={width-right} y1={currentY} y2={currentY}/>}
      <polyline className="rc-trajectory" points={result.curve.map(point=>`${x(point.hrtHours)},${y(point[metric]*factor)}`).join(" ")}/>
      {currentX!==null&&currentY!==null&&<circle className="rc-current-marker" cx={currentX} cy={currentY} r={8}/>}
      {!retained&&currentY!==null&&Math.abs(selectedY-currentY)>5&&<g className={`rc-change-arrow rc-change-${outputDirection}`}><line x1={deltaX} x2={deltaX} y1={currentY} y2={selectedY}/><polygon points={outputDirection==="up"?`${deltaX},${selectedY-8} ${deltaX-6},${selectedY+3} ${deltaX+6},${selectedY+3}`:`${deltaX},${selectedY+8} ${deltaX-6},${selectedY-3} ${deltaX+6},${selectedY-3}`}/></g>}
      <g className={retained?"rc-retained-callout":"rc-ai-callout"}>
        <line x1={calloutToRight?greenX:greenX+greenWidth} y1={greenY+calloutHeight/2} x2={selectedX} y2={selectedY}/>
        <rect x={greenX} y={greenY} width={greenWidth} height={calloutHeight} rx={9}/>
        <text x={greenX+12} y={greenY+23}>{selectedName}: {format(selected.hrtHours,2)} h</text>
      </g>
      {!retained&&timeCallout&&<g className={`rc-time-callout rc-time-${timeDirection}`}>
        <line x1={calloutToRight?redX:redX+redWidth} y1={redY+calloutHeight/2} x2={selectedX} y2={selectedY}/>
        <rect x={redX} y={redY} width={redWidth} height={calloutHeight} rx={9}/>
        <text x={redX+12} y={redY+23}>{timeCallout}</text>
      </g>}
      {!retained&&<circle className="rc-selected-marker" cx={selectedX} cy={selectedY} r={9}/>}
      <text className="rc-x-title" x={width/2} y={height-2} textAnchor="middle">Retention time (HRT)</text>
    </svg></div>
    <div className="rc-legend"><span><i className="rc-legend-line"/>Fitted HRT trajectory</span><span><i className="rc-legend-baseline"/>{energy?"Model baseline (2 h)":result.workbookBaseline?"Workbook baseline":"Current scenario"}</span><span><i className={retained?"rc-legend-retained":"rc-legend-selected"}/>{selectedName}</span></div>
    <p className="rc-note">{note} Projections are model estimates, not measured operating history or plant-validated gains.</p>
  </div>;
}
