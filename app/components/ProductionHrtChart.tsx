"use client";
import {useEffect, useId, useMemo, useRef, useState} from "react";
import {ArrowBigDown, ArrowBigUp, Clock3, Minus} from "lucide-react";
import type {ResearchResult} from "../lib/hrt-research-execution";
import {productionHrtChartData, productionHrtMetrics, type ProductionHrtMetric} from "../lib/production-hrt-chart";
import "./production-hrt-chart.css";

const format = (v: number | null, digits = 2) => v === null ? "—" : v.toLocaleString("en-US", {maximumFractionDigits: digits});
const signed = (v: number | null) => v === null ? "—" : `${v > 0 ? "+" : ""}${format(v)}`;

export default function ProductionHrtChart({result, metric}: {result: ResearchResult; metric: ProductionHrtMetric}) {
  const [width, setWidth] = useState(900), plot = useRef<HTMLDivElement>(null), titleId = useId();
  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width;
      if (next > 0) setWidth(Math.max(180, Math.round(next)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const data = useMemo(() => productionHrtChartData(result, metric), [result, metric]);
  const sameTank=result.pairedComparison?.sameTank;
  const info = productionHrtMetrics[metric], compact = width < 600;
  const height = compact ? 390 : 440, left = compact ? 49 : 72, right = 16, top = 58, bottom = 62;
  const x = (v: number) => left + (v - data.domain.xMin) / (data.domain.xMax - data.domain.xMin) * (width - left - right);
  const y = (v: number) => height - bottom - (v - data.domain.yMin) / (data.domain.yMax - data.domain.yMin) * (height - top - bottom);
  const labelWidth = Math.min(compact ? 164 : 205, width - 12);
  const clampX = (v: number) => Math.max(4, Math.min(width - labelWidth - 4, v));
  const aiBox = data.selected ? {x: clampX(x(data.selected.x) - labelWidth - 12), y: Math.max(3, y(data.selected.y) - 69)} : null;
  let baseBox = data.baseline ? {x: clampX(x(data.baseline.x) - labelWidth - 12), y: Math.min(height - bottom - 49, y(data.baseline.y) + 19)} : null;
  if (aiBox && baseBox && Math.abs(aiBox.x - baseBox.x) < labelWidth + 8 && Math.abs(aiBox.y - baseBox.y) < 58) {
    baseBox = {...baseBox, y: aiBox.y + 59 < height - bottom - 49 ? aiBox.y + 59 : Math.max(3, aiBox.y - 59)};
  }
  const timeText = data.changeHours === null ? "HRT comparison unavailable" : data.direction === "unchanged" ? "HRT unchanged · 0 h" : `HRT ${data.direction === "decrease" ? "decreases" : "increases"} ${format(Math.abs(data.changeHours))} h`;
  const positive = data.outputChange !== null && data.outputChange > 0;
  const negative = data.outputChange !== null && data.outputChange < 0;
  const outputLabel = data.outputChange === null ? "Output comparison unavailable" : `${info.name} output ${positive ? "increases" : negative ? "decreases" : "unchanged"}`;
  const timeLabel = !sameTank ? "Shared input HRT" : data.changeHours === null ? "HRT comparison unavailable" : data.direction === "unchanged" ? "HRT unchanged" : `HRT ${data.direction === "decrease" ? "decreases" : "increases"}`;
  const timeDetail = sameTank && data.changeHours !== null ? `${format(data.baseline?.x ?? null)} h → ${format(data.selected?.x ?? null)} h · ${format(Math.abs(data.changeHours))} h ${data.direction === "unchanged" ? "change" : data.direction}` : `${format(data.selected?.x ?? null)} h`;
  const arrowId = titleId.replace(/[^a-zA-Z0-9_-]/g, "") + "-point";
  return <section className="phc-panel" aria-labelledby={titleId} data-output={metric} data-run-id={result.runId} data-point-count={data.points.length}>
    <div className="phc-intro"><span>PRODUCTION MODEL ANALYSIS · INPUT HRT</span><h3 id={titleId}>{info.name} {sameTank?"optimization: BEFORE vs AFTER HRT":"model outputs across HRT"}</h3><p>{data.points.length.toLocaleString()} evaluated scenarios {sameTank?`in ${sameTank.stage} from 2,000 evaluations`:"from this run"} · Selected input {result.pairedComparison?.input.id}</p></div>
    <div className="phc-signals">
      <div className={`phc-signal ${positive ? "phc-gain" : negative ? "phc-loss" : "phc-neutral"}`}>{positive ? <ArrowBigUp aria-hidden="true"/> : negative ? <ArrowBigDown aria-hidden="true"/> : <Minus aria-hidden="true"/>}<div><strong>{outputLabel}</strong><span>{signed(data.outputChange)} {info.unit} · {data.outputPct === null ? "percentage unavailable" : `${signed(data.outputPct)}% vs baseline`}</span></div></div>
      <div className={`phc-signal phc-time ${sameTank && data.changeHours !== null ? `phc-time-${data.direction}` : ""}`}>{sameTank && data.direction === "decrease" ? <ArrowBigDown aria-hidden="true"/> : sameTank && data.direction === "increase" ? <ArrowBigUp aria-hidden="true"/> : <Clock3 aria-hidden="true"/>}<div><strong>{timeLabel}</strong><span>{timeDetail}</span></div></div>
    </div>
    <div className="phc-cards">
      <div className="phc-ai"><span>{sameTank?"AI-selected AFTER HRT":"Shared input HRT"}</span><strong data-value="selected-hrt">{format(data.selected?.x ?? null)} <small>h</small></strong></div>
      <div><span>{sameTank?"Source BEFORE HRT":"Evaluated inputs"}</span><strong data-value="baseline-hrt">{sameTank?format(data.baseline?.x??null):data.points.length.toLocaleString()} <small>{sameTank?"h":"scenarios"}</small></strong>{sameTank&&<small>{format((data.baseline?.x??0)/24)} days</small>}</div>
      <div className="phc-ai"><span>AI optimized {info.name.toLowerCase()}</span><strong data-value="selected-output">{format(data.selected?.y ?? null)} <small>{info.unit}</small></strong></div>
      <div><span>Baseline {info.name.toLowerCase()}</span><strong data-value="baseline-output">{format(data.baseline?.y ?? null)} <small>{info.unit}</small></strong></div>
    </div>
    <div className="phc-y-title">{info.name} ({info.unit})</div>
    <div className="phc-plot" ref={plot}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${info.name} versus HRT in hours: production model analysis`}>
      <defs><marker id={`${arrowId}-ai`} markerWidth="8" markerHeight="8" refX="12" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 Z" fill="#18a234"/></marker><marker id={`${arrowId}-baseline`} markerWidth="8" markerHeight="8" refX="12" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L8,4 L0,8 Z" fill="#697c8b"/></marker></defs>
      <title>{info.name} versus HRT</title><desc>{data.points.length} saved model evaluations. Baseline {format(data.baseline?.y ?? null)} {info.unit} at {format(data.baseline?.x ?? null)} hours. AI selected {format(data.selected?.y ?? null)} {info.unit} at {format(data.selected?.x ?? null)} hours. {timeText}. Other model inputs vary between scenarios.</desc>
      {[0, .25, .5, .75, 1].map(t => {const v = data.domain.yMin + t * (data.domain.yMax - data.domain.yMin); return <g key={t}><line className="phc-grid" x1={left} x2={width - right} y1={y(v)} y2={y(v)}/><text className="phc-axis" x={left - 8} y={y(v) + 4} textAnchor="end">{format(v, 1)}</text></g>;})}
      {(compact ? [0, .5, 1] : [0, .2, .4, .6, .8, 1]).map(t => {const v = data.domain.xMin + t * (data.domain.xMax - data.domain.xMin); return <g key={t}><line className="phc-grid" x1={x(v)} x2={x(v)} y1={top} y2={height - bottom}/><text className="phc-axis" x={x(v)} y={height - bottom + 24} textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}>{format(v, 1)} h</text></g>;})}
      {sameTank&&data.baseline&&data.selected&&<line className="phc-pair-connector" x1={x(data.baseline.x)} y1={y(data.baseline.y)} x2={x(data.selected.x)} y2={y(data.selected.y)} stroke="#149c51" strokeWidth="3" strokeDasharray="9 6"/>}
      <polyline className="phc-baseline-curve" points={data.baselineCurve.map(p => `${x(p.x)},${y(p.y)}`).join(" ")}/>
      <path className="phc-cloud" d={data.points.map(p => `M${x(p.x).toFixed(2)} ${y(p.y).toFixed(2)}h.01`).join(" ")}/>
      <polyline className="phc-trend" points={data.trend.map(p => `${x(p.x)},${y(p.y)}`).join(" ")}/>
      {data.baseline && <><line className="phc-baseline-reference" x1={left} x2={width - right} y1={y(data.baseline.y)} y2={y(data.baseline.y)}/><circle className="phc-baseline-point" data-point="baseline" data-x={data.baseline.x} data-y={data.baseline.y} cx={x(data.baseline.x)} cy={y(data.baseline.y)} r={7}/></>}
      {data.selected && <circle className="phc-selected-point" data-point="selected" data-x={data.selected.x} data-y={data.selected.y} cx={x(data.selected.x)} cy={y(data.selected.y)} r={8}/>}
      {data.baseline && baseBox && <g className="phc-callout phc-base-callout"><line x1={baseBox.x + labelWidth / 2} y1={baseBox.y + 24} x2={x(data.baseline.x)} y2={y(data.baseline.y)} markerEnd={`url(#${arrowId}-baseline)`}/><rect {...baseBox} width={labelWidth} height={49} rx={7}/><text x={baseBox.x + 10} y={baseBox.y + 20}>{sameTank?`Baseline: ${format(data.baseline.x)} h`:"Baseline output"}</text><text x={baseBox.x + 10} y={baseBox.y + 38}>{format(data.baseline.y)} {info.unit}</text></g>}
      {data.selected && aiBox && <g className="phc-callout phc-ai-callout"><line x1={aiBox.x + labelWidth / 2} y1={aiBox.y + 24} x2={x(data.selected.x)} y2={y(data.selected.y)} markerEnd={`url(#${arrowId}-ai)`}/><rect {...aiBox} width={labelWidth} height={49} rx={7}/><text x={aiBox.x + 10} y={aiBox.y + 20}>{sameTank?`AI selected: ${format(data.selected.x)} h`:"AI output"}</text><text x={aiBox.x + 10} y={aiBox.y + 38}>{format(data.selected.y)} {info.unit}</text></g>}
      <text className="phc-x-title" x={(left + width - right) / 2} y={height - 12} textAnchor="middle">HRT (hours)</text>
    </svg></div>
    <div className="phc-legend"><span><i className="phc-dot"/>Evaluated AI predictions</span><span><i className="phc-line"/>AI mean per HRT band</span><span><i className="phc-base-line" style={sameTank?{borderTop:"3px dashed #149c51",background:"transparent"}:undefined}/>{sameTank?"BEFORE → AFTER comparison":"HRT baseline model"}</span><span><i className="phc-grey"/>Baseline</span><span><i className="phc-green"/>AI selected</span></div>
    <p className="phc-note">{sameTank?"The full time axis includes the original BEFORE HRT. The dashed connector links the saved BEFORE and AI AFTER pair; it is not a fitted curve across unobserved hours. Blue points and means show evaluated inputs within this stage. Temperature, pH and SRT also vary.":"Each point uses this run’s saved prediction. The blue line summarizes predictions in up to 12 HRT bands; pathway, temperature, pH, feed and loading also vary. It does not isolate the effect of HRT alone."}</p>
    {data.direction === "unchanged" && <p className="phc-basis">Both output models use the shared input HRT. For original BEFORE / AFTER retention times, open HRT in hours and choose Source BEFORE → AFTER.</p>}
    <details className="phc-evidence"><summary>Graph calculation and saved run</summary><p>Run <code>{result.runId}</code> · Model <code>{result.modelVersion}</code>. {sameTank?`Baseline: ${sameTank.sourceFile}, sheet ${sameTank.sourceSheet}, row ${sameTank.baselineSourceRow}; named BEFORE columns. Model AFTER input interpolates source scenarios ${result.pairedComparison!.input.parentA} and ${result.pairedComparison!.input.parentB}.`:"Baseline values come from the saved HRT model evaluation for each candidate."} The selected markers match the cards and Day / Month / Year comparisons.</p><p>Output change = AI output − baseline; gain = change ÷ baseline × 100. HRT change = AI-selected HRT − baseline HRT. The graph introduces no new predictions. Results remain exploratory model estimates; plant validation is pending.</p></details>
  </section>;
}
