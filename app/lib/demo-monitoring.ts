import source from "../../data/demo-monitoring/readings.json";
import sensor400 from "../../data/demo-monitoring/sensor-400.json";

export const DEMO_VERSION="demo-monitoring-1.0.0";
export const CURRENT_MONITORING_VERSION="monitoring-sensor-400-2026-11-10-v2";
export type Metric="feed"|"codIn"|"codOut"|"ph"|"temp"|"pressure"|"h2s"|"o2"|"volts"|"gas"|"ch4"|"kw"|"gasEstimate"|"codRemoval";
export type Reading={t:string}&Record<Metric,number|null>;
export type Rule={id:string;metric:Metric;label:string;unit:string;direction:"low"|"high";warning:number;critical:number};
export const demoReadings:Reading[]=source;
export function monitoringSource(version=CURRENT_MONITORING_VERSION){
 if(version===CURRENT_MONITORING_VERSION)return {version,rows:sensor400.rows as Reading[],metadata:sensor400.metadata};
 if(version===DEMO_VERSION)return {version,rows:demoReadings,metadata:{version:DEMO_VERSION,sourceFile:"aquaivolt_iot_simulation 77.csv",selectedRows:58,sourceTotalRows:58,selection:"Original 58-row v77 reference source",provenance:"Generated reference data; not plant measurements",sourceTimezone:"Unspecified"}};
 throw new Error("Unknown monitoring source version.");
}
export const currentMonitoringSource=monitoringSource();
export function expectedCrossings(version:string):Record<string,{warning:number;critical:number}>{
 if(version===CURRENT_MONITORING_VERSION)return sensor400.metadata.expectedCrossings;
 if(version===DEMO_VERSION)return Object.fromEntries(demoRules.map(r=>[r.id,{warning:({gasLow:14,ch4Low:6,codRemovalLow:16,kwLow:13} as Record<string,number>)[r.id]??0,critical:r.id==="kwLow"?1:0}]));
 throw new Error("Unknown monitoring source version.");
}
export const demoRules:Rule[]=[
 {id:"gasLow",metric:"gas",label:"Low biogas flow",unit:"Nm³/h",direction:"low",warning:2.6,critical:2.2},
 {id:"ch4Low",metric:"ch4",label:"Low methane",unit:"%",direction:"low",warning:60,critical:58},
 {id:"codRemovalLow",metric:"codRemoval",label:"Low COD removal",unit:"%",direction:"low",warning:62,critical:58},
 {id:"phLow",metric:"ph",label:"Low pH",unit:"pH",direction:"low",warning:6.9,critical:6.7},
 {id:"phHigh",metric:"ph",label:"High pH",unit:"pH",direction:"high",warning:7.6,critical:7.8},
 {id:"tempLow",metric:"temp",label:"Low temperature",unit:"°C",direction:"low",warning:35.5,critical:35},
 {id:"tempHigh",metric:"temp",label:"High temperature",unit:"°C",direction:"high",warning:38,critical:39},
 {id:"h2sHigh",metric:"h2s",label:"High H₂S",unit:"ppm",direction:"high",warning:180,critical:250},
 {id:"o2High",metric:"o2",label:"High oxygen",unit:"%",direction:"high",warning:0.7,critical:1},
 {id:"pressureHigh",metric:"pressure",label:"High pressure",unit:"mbar",direction:"high",warning:18,critical:22},
 {id:"kwLow",metric:"kw",label:"Low electrical power",unit:"kW",direction:"low",warning:4.7,critical:4.3},
 {id:"voltsLow",metric:"volts",label:"Low voltage",unit:"V",direction:"low",warning:390,critical:380},
 {id:"voltsHigh",metric:"volts",label:"High voltage",unit:"V",direction:"high",warning:415,critical:425},
];
export const demoSites=[{id:"ainsaade",name:"Ain Saade",region:"Mount Lebanon",x:150,y:168,connected:true},{id:"bekfaya",name:"Bekfaya",region:"Mount Lebanon",x:166,y:123,connected:false},{id:"jdeideh",name:"Jdeideh Industrial Site",region:"Metn / Beirut suburbs",x:140,y:128,connected:false},{id:"baabda",name:"Baabda",region:"Mount Lebanon",x:155,y:196,connected:false}];
export type Severity="normal"|"warning"|"critical"|"unknown";
export function classify(value:number|null,rule:Rule):Severity{
 if(value===null||!Number.isFinite(value))return "unknown";
 const crosses=(n:number)=>rule.direction==="low"?value<=n:value>=n;
 return crosses(rule.critical)?"critical":crosses(rule.warning)?"warning":"normal";
}
export function validateRules(value:unknown):Rule[]{
 if(!Array.isArray(value)||value.length!==demoRules.length)throw new Error("All 13 demo thresholds are required.");
 const rules=demoRules.map(base=>{const input=value.find(r=>r?.id===base.id);if(!input||typeof input.warning!=="number"||typeof input.critical!=="number"||!Number.isFinite(input.warning)||!Number.isFinite(input.critical)||input.warning<0||input.critical<0||input.warning>1000000||input.critical>1000000)throw new Error(`Invalid ${base.label} thresholds.`);if(base.direction==="low"?input.critical>=input.warning:input.critical<=input.warning)throw new Error(`Critical must be ${base.direction==="low"?"below":"above"} warning for ${base.label}.`);return {...base,warning:input.warning,critical:input.critical};});
 for(const [lo,hi] of [["phLow","phHigh"],["tempLow","tempHigh"],["voltsLow","voltsHigh"]])if(rules.find(r=>r.id===lo)!.warning>=rules.find(r=>r.id===hi)!.warning)throw new Error("Low and high warning ranges must not overlap.");
 return rules;
}
export type Alarm={id:string;ruleId:string;label:string;severity:Exclude<Severity,"normal">;value:number|null;unit:string;openedAt:string;lastAt:string;resolvedAt:string|null;acknowledgedAt:string|null;acknowledgedBy:string|null;transitions:{at:string;severity:Severity;value:number|null}[]};
export type Snapshot={id:string;sessionId:string;parentId:string|null;version:string;siteId:string;createdAt:string;receivedAt:string;sourceIndex:number;fixture:string|null;reading:Reading;rules:Rule[];alarms:Alarm[];sequence:number;actor:string;sampleHistory:{at:string;reading:Reading;fixture:string|null}[]};
export type Command={action:"start"|"step"|"sample"|"fixture"|"thresholds"|"acknowledge"|"check";index?:number;fixture?:string;rules?:Rule[];alarmId?:string};
export const fixtureNames=["normal","warning","h2s-critical","oxygen-critical","pressure-critical","methane-critical","power-critical","missing","stale"];
export function fixtureReading(name:string,version=DEMO_VERSION):Reading{
 if(!fixtureNames.includes(name))throw new Error("Unknown demo fixture.");
 const first=monitoringSource(version).rows[0];
 const r:Reading={...first,gas:3,ch4:63,kw:5.5,codOut:6000,codRemoval:(first.codIn!-6000)/first.codIn!*100};
 if(name==="warning")r.h2s=180;
 if(name==="h2s-critical")r.h2s=250;
 if(name==="oxygen-critical")r.o2=1;
 if(name==="pressure-critical")r.pressure=22;
 if(name==="methane-critical")r.ch4=58;
 if(name==="power-critical")r.kw=4.3;
 if(name==="missing")r.h2s=null;
 return r;
}
export function assessment(s:Snapshot,at=s.createdAt){
 const checks=s.rules.map(rule=>({id:rule.id,label:rule.label,unit:rule.unit,value:s.reading[rule.metric],severity:classify(s.reading[rule.metric],rule)}));
 const missing=Object.entries(s.reading).filter(([k,v])=>k!=="t"&&(v===null||typeof v!=="number"||!Number.isFinite(v))).map(([k])=>k);
 if(missing.length)checks.push({id:"missing",label:`Missing reading: ${missing.join(", ")}`,unit:"",value:null,severity:"unknown"});
 const stale=Date.parse(at)-Date.parse(s.receivedAt)>60000;
 if(stale)checks.push({id:"stale",label:"Demo feed is stale (>60 seconds)",unit:"seconds",value:Math.round((Date.parse(at)-Date.parse(s.receivedAt))/1000),severity:"unknown"});
 const hold=checks.some(c=>c.severity==="critical"||c.severity==="unknown");
 return {checks,hold,stale,status:checks.some(c=>c.severity==="critical")?"critical":checks.some(c=>c.severity==="unknown")?"unknown":checks.some(c=>c.severity==="warning")?"warning":"normal"} as const;
}
export function advance(previous:Snapshot|null,command:Command,id:string,at:string,actor:string,version=previous?.version??DEMO_VERSION):Snapshot{
 const readings=monitoringSource(version).rows;
 if(!["start","step","sample","fixture","thresholds","acknowledge","check"].includes(command.action))throw new Error("Unknown monitoring action.");
 if(command.action!=="start"&&!previous)throw new Error("Start or restore a monitoring session first.");
 if(previous&&previous.sequence>=500&&command.action!=="start")throw new Error("This demo session reached 500 records. Start a new session; its history remains saved.");
 const s:Snapshot=command.action==="start"?{id,sessionId:id,parentId:null,version,siteId:"ainsaade",createdAt:at,receivedAt:at,sourceIndex:0,fixture:null,reading:{...readings[0]},rules:structuredClone(demoRules),alarms:[],sequence:0,actor,sampleHistory:[]}:structuredClone(previous!);
 s.parentId=command.action==="start"?null:previous!.id;s.id=id;s.createdAt=at;s.actor=actor;s.sequence++;
 let newReading=command.action==="start";
 if(command.action==="step"||command.action==="sample"){
  const index=command.action==="step"?s.sourceIndex+1:command.index;
  if(!Number.isInteger(index)||index!<0||index!>=readings.length)throw new Error(`Choose a source row from 1 to ${readings.length}. Replay has no implicit wrap.`);
  s.sourceIndex=index!;s.reading={...readings[index!]};s.fixture=null;newReading=true;
 }
 if(command.action==="fixture"){s.reading=fixtureReading(command.fixture!,s.version);s.fixture=command.fixture!;newReading=true;}
 if(newReading){s.receivedAt=s.fixture==="stale"?new Date(Date.parse(at)-120000).toISOString():at;s.sampleHistory.push({at,reading:{...s.reading},fixture:s.fixture});s.sampleHistory=s.sampleHistory.slice(-500);}
 if(command.action==="thresholds")s.rules=validateRules(command.rules);
 if(command.action==="acknowledge"){const alarm=s.alarms.find(a=>a.id===command.alarmId&&!a.resolvedAt);if(!alarm)throw new Error("Active alarm not found.");alarm.acknowledgedAt=at;alarm.acknowledgedBy=actor;}
 const checks=assessment(s).checks;
 for(const alarm of s.alarms.filter(a=>!a.resolvedAt)){
  const check=checks.find(c=>c.id===alarm.ruleId);
  if(!check||check.severity==="normal"){alarm.resolvedAt=at;alarm.lastAt=at;alarm.transitions.push({at,severity:"normal",value:check?.value??null});}
 }
 for(const check of checks.filter(c=>c.severity!=="normal")){
  const active=s.alarms.find(a=>a.ruleId===check.id&&!a.resolvedAt);
  if(active){if(active.severity!==check.severity){active.transitions.push({at,severity:check.severity,value:check.value});active.acknowledgedAt=null;active.acknowledgedBy=null;}active.severity=check.severity as Alarm["severity"];active.value=check.value;active.lastAt=at;}
  else s.alarms.push({id:`${id}:${check.id}`,ruleId:check.id,label:check.label,severity:check.severity as Alarm["severity"],unit:check.unit,value:check.value,openedAt:at,lastAt:at,resolvedAt:null,acknowledgedAt:null,acknowledgedBy:null,transitions:[{at,severity:check.severity,value:check.value}]});
 }
 return s;
}
// The client's v77 engineering formula, not a trained ML model or sensor measurement.
export function engineeringBaseline(r:Reading){
 if([r.feed,r.codIn,r.codOut,r.ph,r.temp,r.ch4].some(v=>v===null||!Number.isFinite(v))||r.feed!<=0||r.codIn!<=0||r.ch4!<=0)return null;
 const removal=(r.codIn!-r.codOut!)/r.codIn!*100,olr=r.feed!*24*r.codIn!/1000/90,hrt=90/r.feed!;
 const effectiveRemoval=Math.max(30,Math.min(88,removal-4*Math.max(0,olr-2.9)));
 const methane=r.feed!*r.codIn!/1000*effectiveRemoval/100*0.35*0.88;
 return {formulaVersion:"v77-engineering-baseline-1",biogasNm3Day:methane/(Math.max(.5,Math.min(.72,r.ch4!/100)))*24,methaneNm3Day:methane*24,powerKw:methane*9.97*.32,codRemovalPct:effectiveRemoval,olrKgCodM3Day:olr,hrtHours:hrt,methanePctAssumed:r.ch4,volumeM3:90,electricalEfficiencyPct:32};
}
export function crossingCounts(readings:Reading[]=demoReadings){return demoRules.map(rule=>({id:rule.id,label:rule.label,warning:readings.filter(r=>classify(r[rule.metric],rule)==="warning").length,critical:readings.filter(r=>classify(r[rule.metric],rule)==="critical").length}));}
