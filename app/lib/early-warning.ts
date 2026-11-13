import source from "../../data/early-warning/source.json";
import {evaluateTrendAdvisory,trendPolicy} from "./early-warning-trends";

export const earlyWarningVersion="early-warning-heuristic-2026-11-10-v1";
export const labKeys=["codIn","codOut","vfa","alkalinity","tan"] as const;
export type LabKey=typeof labKeys[number];
export type LabSample={value:number;sampledAt:string;availableAt:string;maxAgeHours:number};
export type WarningRequest={index:number;mode:"workbook"|"laboratory";labs?:Partial<Record<LabKey,LabSample>>};
export const warningPolicy={warning:55,highRisk:75,forecastHours:12,review:"High-risk advisories require operator review. Acknowledgement does not clear the condition or authorize equipment control.",protection:"AI and this workflow are advisory. Independently engineered protection is required for gas leaks, overpressure, exposure and electrical faults."};
export const warningSource=source;
export class WarningInputError extends Error {}
const positive=(n:number)=>Math.max(0,n);
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
export function replayTime(index:number){return source.rows[index].Timestamp.replace(" ","T")+":00Z";}
export function checkWarningRequest(value:unknown):WarningRequest{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new WarningInputError("A request object is required.");
 const r=value as WarningRequest;
 if(!Number.isInteger(r.index)||r.index<0||r.index>=source.rows.length)throw new WarningInputError("Choose a source row from 0 to 479.");
 if(r.mode!=="workbook"&&r.mode!=="laboratory")throw new WarningInputError("Choose workbook or laboratory timing mode.");
 if(r.labs!==undefined&&(!r.labs||typeof r.labs!=="object"||Array.isArray(r.labs)))throw new WarningInputError("Laboratory samples must be an object.");
 for(const [key,s] of Object.entries(r.labs??{})){
  if(!labKeys.includes(key as LabKey)||!s||!finite(s.value)||s.value<0||!finite(s.maxAgeHours)||s.maxAgeHours<=0||s.maxAgeHours>720)throw new WarningInputError("Laboratory values must be non-negative numbers with an explicit maximum age of 0–720 hours.");
  for(const time of [s.sampledAt,s.availableAt])if(typeof time!=="string"||!/(Z|[+-]\d{2}:\d{2})$/.test(time)||!Number.isFinite(Date.parse(time)))throw new WarningInputError("Laboratory timestamps require a date, time and explicit UTC offset.");
  if(Date.parse(s.availableAt)<Date.parse(s.sampledAt))throw new WarningInputError("A result cannot be available before its sample was collected.");
 }
 return {index:r.index,mode:r.mode,...(r.mode==="laboratory"?{labs:r.labs??{}}:{})};
}
export function labAvailability(sample:LabSample|undefined,at:string){
 if(!sample)return {status:"missing",value:null,ageHours:null};
 const age=(Date.parse(at)-Date.parse(sample.sampledAt))/3600000;
 const status=age<0?"future sample":Date.parse(sample.availableAt)>Date.parse(at)?"result pending":age>sample.maxAgeHours?"stale":"available";
 return {...sample,status,value:status==="available"?sample.value:null,ageHours:age,effectiveValue:status==="available"?sample.value:null};
}
export type WarningFeatures={ratio:number|null;ph6h:number|null;ch4SixHours:number|null;olr:number|null;temperature:number;h2s:number;residual:number;power:number};
// Only allowlisted current/past features enter this function. Future labels never enter inference.
export function heuristicScore(f:WarningFeatures){
 if(f.ratio===null||f.ph6h===null||f.ch4SixHours===null||f.olr===null)return {score:null,contributions:[] as {name:string;points:number}[]};
 const contributions=[{name:"Base",points:10},{name:"VFA / alkalinity proxy",points:95*positive(f.ratio-.22)},{name:"Six-hour pH decline",points:4*positive(-f.ph6h*10)},{name:"Six-hour methane decline",points:2.2*positive(-f.ch4SixHours)},{name:"Organic loading",points:5*positive(f.olr-2)},{name:"Cooling",points:5*positive(36-f.temperature)},{name:"H₂S outlet",points:.1*positive(f.h2s-80)},{name:"Gas / power residual",points:.65*positive(f.residual-8)},{name:"Power decline",points:8*positive(6.2-f.power)}];
 return {score:Math.min(100,Math.max(0,Math.round(contributions.reduce((sum,c)=>sum+c.points,0)))),contributions};
}
export function evaluateWarning(raw:unknown){
 const request=checkWarningRequest(raw),row=source.rows[request.index],past=source.rows[request.index-6],at=replayTime(request.index);
 const values={codIn:row.COD_In_mgL,codOut:row.COD_Out_mgL,vfa:row.VFA_mgL_as_HAc,alkalinity:row.Alkalinity_mgL_as_CaCO3,tan:row.TAN_mgL};
 const labs=labKeys.map(key=>({key,...(request.mode==="workbook"?{status:"generated hourly workbook value",value:values[key],effectiveValue:values[key],ageHours:null,sampledAt:null,availableAt:null,maxAgeHours:null}:labAvailability(request.labs?.[key],at))}));
 const lab=(key:LabKey)=>{const s=labs.find(s=>s.key===key)!;return "effectiveValue" in s?s.effectiveValue:s.value;};
 const codIn=lab("codIn"),codOut=lab("codOut"),vfa=lab("vfa"),alk=lab("alkalinity");
 const removal=codIn!==null&&codIn>0&&codOut!==null?(codIn-codOut)/codIn*100:null;
 const features:WarningFeatures={ratio:vfa!==null&&alk!==null&&alk>0?vfa/alk:null,ph6h:past?row.pH-past.pH:request.mode==="workbook"?0:null,ch4SixHours:past?row.CH4_pct-past.CH4_pct:request.mode==="workbook"?0:null,olr:codIn!==null?row.Feed_m3h*24*codIn/1000/90:null,temperature:row.Temp_C,h2s:row.H2S_Gas_Outlet_ppm,residual:Math.abs(row.Generator_kW-row.Biogas_Flow_Nm3h*row.CH4_pct/100*9.97*.32)/Math.max(row.Generator_kW,.01)*100,power:row.Generator_kW};
 const sensorValues=[row.pH,row.pH,row.Temp_C,row.Temp_C,row.CH4_pct,removal,row.Biogas_Flow_Nm3h,row.H2S_Gas_Outlet_ppm,row.Gas_Pressure_mbar,row.Generator_kW,row.Voltage_V,row.Voltage_V,row.O2_Gas_pct];
 const fixedAlarms=source.thresholds.map((rule,i)=>{const value=sensorValues[i];const crosses=(limit:number)=>value!==null&&(rule.side==="LOW"?value<=limit:value>=limit);return {...rule,value,status:value===null?"unavailable":crosses(rule.critical)?"critical":crosses(rule.warning)?"warning":"normal"};});
 const calculated=heuristicScore(features),score=calculated.score;
 const advisory=score===null?"unavailable":score>=warningPolicy.highRisk?"high-risk":score>=warningPolicy.warning?"predictive warning":"normal";
 return {version:earlyWarningVersion,request,index:request.index,decisionAt:at,sourceTime:row.Timestamp,mode:request.mode,provenance:source.metadata.provenance,features,labs,engineering:{codRemovalPct:removal,olr:features.olr,hrtHours:90/row.Feed_m3h,ratioProxy:features.ratio},...calculated,advisory,fixedAlarms,reviewRequired:advisory==="high-risk",hasCriticalAlarm:fixedAlarms.some(a=>a.status==="critical"),scoreMeaning:"Heuristic points, not failure probability or calibrated uncertainty",labNotice:request.mode==="workbook"?"Hourly laboratory values are generated workbook inputs. Actual collection/result times are not supplied. This mode proves calculation only.":"Only samples collected and results available by the decision time, within their stated maximum age, contribute. TAN is contextual; it is not a term in this heuristic.",warmup:request.index<6,automation:"No equipment control. Review acknowledgement does not clear alarms."};
}
export function evaluateWarningEvents(){
 const runs=source.rows.map((_,index)=>evaluateWarning({index,mode:"workbook"}));
 const hourly={truePositive:0,falsePositive:0,falseNegative:0,trueNegative:0};
 let scoreMismatches=0,alarmMismatches=0;
 runs.forEach((r,i)=>{const row=source.rows[i],predicted=r.score!>=55&&!r.hasCriticalAlarm,positive=row.Future_Onset_12h===1;hourly[positive?(predicted?"truePositive":"falseNegative"):(predicted?"falsePositive":"trueNegative")]++;if(r.score!==row.EarlyWarning_Score_0to100)scoreMismatches++;if(Number(r.hasCriticalAlarm)!==row.Conventional_Alarm)alarmMismatches++;});
 const events=source.events.map((event,i)=>{const window=runs.slice(event.onset-12,event.onset);const first=window.find(r=>r.score!>=55&&!r.hasCriticalAlarm);const firstFixed=window.find(r=>r.fixedAlarms.some(a=>a.status==="warning"||a.status==="critical"));const firstCritical=window.find(r=>r.hasCriticalAlarm);return {...event,partition:i<4?"TRAIN":i===4?"VALIDATION":"TEST",onsetAt:replayTime(event.onset),detectedBeforeCritical:!!first,firstPredictiveAt:first?.decisionAt??null,leadHours:first?event.onset-first.index:null,firstFixedAt:firstFixed?.decisionAt??null,firstCriticalAt:firstCritical?.decisionAt??null};});
 // Exclude ongoing injected failures from false-positive assessment; do not use the workbook's six-hour At_Onset flag.
 const eligible=runs.filter(r=>!source.events.some(e=>r.index>=e.onset&&r.index<=e.end));
 return {version:earlyWarningVersion,method:"Frozen heuristic; retrospective event-separated replay. No model was trained or independently validated here.",hourlyWorkbookComparator:{...hourly,recall:hourly.truePositive/(hourly.truePositive+hourly.falseNegative),definition:"Score >=55 AND no critical fixed alarm, reproducing the workbook comparator; all 480 rows included."},events,scoreMismatches,alarmMismatches,eventDetection:{detected:events.filter(e=>e.detectedBeforeCritical).length,total:events.length},eligiblePreFailure:{rows:eligible.length,falsePositiveHours:eligible.filter(r=>source.rows[r.index].Future_Onset_12h===0&&r.score!>=55&&!r.hasCriticalAlarm).length,excluded:"Injected onset through event end, inclusive"},split:{trainRows:336,validationRows:72,testRows:72,eventOverlap:0,independentSites:0},limits:["One injected event per fault family. No evidence of generalization to plant events or independent sites.","Original hourly laboratory inputs have no collection/availability times; this evaluation is workbook reproduction only.","High-risk advisories and fixed alarms are displayed independently in the application; the historical comparator suppresses predictive warnings during a critical alarm.","A future trained classifier needs measured events, complete event/site holdouts and timestamp-aware laboratory features."]};
}

export function compareWarningPolicies(){
 const old=evaluateWarningEvents(),runs=source.rows.map((_,index)=>evaluateWarning({index,mode:"workbook"}));
 const trends=source.rows.map((_,index)=>evaluateTrendAdvisory(source.rows,index,source.thresholds));
 const events=source.events.map((event,i)=>{
  // Compare against the FIRST fixed warning OR critical alarm, not just critical
  // alarms or a truncated pre-onset window which can hide an earlier fixed alert.
  const interval=runs.slice(event.start,event.end+1);
  const fixed=interval.find(r=>r.fixedAlarms.some(a=>a.status==="warning"||a.status==="critical"));
  const critical=interval.find(r=>r.hasCriticalAlarm);
  const firstLegacy=interval.find(r=>r.index<event.onset&&r.score!==null&&r.score>=55&&!r.hasCriticalAlarm);
  const firstTrend=interval.find(r=>r.index<event.onset&&trends[r.index].triggered);
  const result=(first:typeof firstLegacy)=>({detectedBeforeOnset:!!first,firstAt:first?.decisionAt??null,leadHoursToOnset:first?event.onset-first.index:null,leadHoursVersusFirstFixed:first&&fixed?fixed.index-first.index:null,earlierThanFixed:Boolean(first&&fixed&&first.index<fixed.index),earlierThanCritical:Boolean(first&&critical&&first.index<critical.index)});
  return {...event,partition:old.events[i].partition,firstFixedAt:fixed?.decisionAt??null,firstCriticalAt:critical?.decisionAt??null,legacy:result(firstLegacy),candidate:result(firstTrend)};
 });
 const normal=source.rows.map((_,i)=>i).filter(i=>!source.events.some(e=>i>=e.start&&i<=e.end));
 const counts=(policy:"legacy"|"candidate")=>({detected:events.filter(e=>e[policy].detectedBeforeOnset).length,earlierThanFixed:events.filter(e=>e[policy].earlierThanFixed).length,total:events.length,
   falseAdvisoryHours:normal.filter(i=>policy==="legacy"?runs[i].score!==null&&runs[i].score!>=55&&!runs[i].hasCriticalAlarm:trends[i].triggered).length,normalHours:normal.length});
 return {version:trendPolicy.version,legacyVersion:earlyWarningVersion,policy:trendPolicy,events,legacy:counts("legacy"),candidate:counts("candidate"),
   method:"Entire-event retrospective comparison. The baseline includes all fixed warning and critical thresholds from event start. Negative lead times are retained. Labels are used only for evaluation.",
   split:old.split,acceptance:"NO PLANT ACCEPTANCE CLAIMED. This previously inspected workbook is a regression benchmark; its TEST label is not a fresh independent holdout for the new policy.",
   limitations:["One injected event per fault family; no independent sites.","Thresholds and slope settings are illustrative and must be commissioned before operational use.","Linear extrapolation can be wrong; estimated crossing times are not calibrated confidence intervals.","A fresh untouched event/site dataset is required before selecting or approving a candidate policy."]};
}
