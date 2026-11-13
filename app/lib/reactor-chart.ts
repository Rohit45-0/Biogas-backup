import type {ProductionKey} from "./hrt-optimization";

export const reactorChartMetrics:Record<ProductionKey,{name:string;unit:string}>={biogasM3Day:{name:"Biogas",unit:"m³/day"},methaneM3Day:{name:"Methane",unit:"m³ CH₄/day"},electricityKwhDay:{name:"Electricity",unit:"kWh/day"}};
type Point={id:string;pathway:string;configuration:string;technology:string;hrtHours:number;outputs:Record<ProductionKey,number>;eligible:boolean};
export type ReactorChartRun={runId:string;modelVersion:string;request:{mode:string;method:string;technology:string};baseline:Record<ProductionKey,number|null>&{hrtHours:number;pathway:string;technology:string};candidates:Point[];selected:Point|null};
export function reactorChartData(run:ReactorChartRun,metric:ProductionKey){
 const pathway=run.selected?.pathway??run.request.technology,configuration=run.selected?.configuration;
 const candidates=run.candidates.filter(p=>p.pathway===pathway&&(!configuration||p.configuration===configuration)&&Number.isFinite(p.hrtHours)&&Number.isFinite(p.outputs[metric])).sort((a,b)=>a.hrtHours-b.hrtHours||a.id.localeCompare(b.id));
 const points=candidates.map(p=>({id:p.id,x:p.hrtHours,y:p.outputs[metric],eligible:p.eligible}));
 const baseline=run.baseline[metric]===null?null:{x:run.baseline.hrtHours,y:run.baseline[metric]};
 const selected=run.selected?{x:run.selected.hrtHours,y:run.selected.outputs[metric]}:null;
 const first=points[0]?.x??run.baseline.hrtHours,last=points.at(-1)?.x??first,span=last-first;
 // This descriptive trend summarizes evaluated multi-input predictions. It is
 // neither a new fit nor a claim that HRT alone determines the output.
 const buckets=new Map<number,typeof points>();
 for(const point of points){const index=span>0?Math.min(11,Math.floor((point.x-first)/span*12)):0;const bin=buckets.get(index)??[];bin.push(point);buckets.set(index,bin);}
 const trend=[...buckets.values()].map(bin=>({x:bin.reduce((sum,p)=>sum+p.x,0)/bin.length,y:bin.reduce((sum,p)=>sum+p.y,0)/bin.length,count:bin.length}));
 const xValues=[...points.map(p=>p.x),run.baseline.hrtHours,...(selected?[selected.x]:[])],yValues=[...points.map(p=>p.y),...(baseline?[baseline.y]:[]),...(selected?[selected.y]:[])];
 const xMin=Math.min(...xValues),xMax=Math.max(...xValues),yMin=yValues.length?Math.min(...yValues):0,yMax=yValues.length?Math.max(...yValues):1;
 const xPadding=Math.max((xMax-xMin)*.035,.05),yPadding=Math.max((yMax-yMin)*.15,Math.abs(yMax)*.01,.05);
 const changeHours=selected?selected.x-run.baseline.hrtHours:null;
 const changePct=changeHours===null||run.baseline.hrtHours===0?null:changeHours/run.baseline.hrtHours*100;
 const outputChange=selected&&baseline?selected.y-baseline.y:null,outputPct=outputChange===null||!baseline||baseline.y===0?null:outputChange/baseline.y*100;
 return {pathway,technology:candidates[0]?.technology??run.baseline.technology,points,trend,baseline,selected,changeHours,changePct,outputChange,outputPct,direction:changeHours===null?"unavailable":Math.abs(changeHours)<1e-9?"unchanged":changeHours<0?"decrease":"increase",domain:{xMin:Math.max(0,xMin-xPadding),xMax:xMax+xPadding,yMin:Math.max(0,yMin-yPadding),yMax:yMax+yPadding}};
}
