import pairedSource from "../../ai-workflow/research/paired-200-2026-11-07/source.json";
import task2Rows from "../../ai-workflow/research/reactor-study-2026-11-09/scenarios.json";
import hoursModel from "../../ai-workflow/research/hours-model.json";
import sameTankModel from "../../ai-workflow/research/same-tank-500-2026-11-10/model.json";
import {fingerprint} from "./evidence";
import {InputError} from "./inputs";

export type ScenarioInputKey="hrtHours"|"temperatureC"|"ph"|"feedRate"|"olr"|"srtDays"|"upflowMHour";
export type ScenarioValues=Partial<Record<ScenarioInputKey,number|null>>;
export type ScenarioStream="task1"|"task2"|"manual";
export type CoverageField={key:ScenarioInputKey;label:string;unit:string;min:number|null;max:number|null;note?:string};
export type CoverageContext={id:string;label:string;source:string;sourceRows:number;fields:CoverageField[];example:ScenarioValues};
export type ScenarioCoverageCatalog={version:string;catalogHash:string;contexts:CoverageContext[];meaning:string};
export type ScenarioInputCheck={id:string;checkedAt:string;catalogHash:string;stream:ScenarioStream;contextId:string;contextLabel:string;sampleLabel:string;runId:string|null;dataSource:"SCENARIO_DATA";
  fields:(CoverageField&{value:number|null;status:"WITHIN"|"OUTSIDE"|"MISSING"|"UNAVAILABLE"})[];
  status:"OUT_OF_RANGE"|"WITHIN_SCENARIO_RANGES"|"PARTIAL_CHECK";outsideCount:number;uncheckedCount:number;meaning:string};

const meaning="Scenario data only. These ranges describe source-data coverage, not validated plant safety limits. Being inside each individual range does not establish that a combination is supported. PLC / IoT inputs are not connected.";
const common:CoverageField[]=[{key:"hrtHours",label:"HRT",unit:"h",min:null,max:null},{key:"temperatureC",label:"Temperature",unit:"°C",min:null,max:null},{key:"ph",label:"pH",unit:"",min:null,max:null}];
function ranges(definitions:CoverageField[],rows:ScenarioValues[]):CoverageField[]{return definitions.map(field=>{
  const values=rows.map(row=>row[field.key]).filter((value):value is number=>typeof value==="number"&&Number.isFinite(value));
  return {...field,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null};
});}
const pairedContexts:CoverageContext[]=[...new Set(pairedSource.rows.map(row=>row.Pathway))].sort().map(pathway=>{
  const source=pairedSource.rows.filter(row=>row.Pathway===pathway&&row["HRT (h)"]>=hoursModel.input.min&&row["HRT (h)"]<=hoursModel.input.max);
  const rows=source.map(row=>({hrtHours:row["HRT (h)"],temperatureC:row["Temp (C)"],ph:row.pH,feedRate:row["Feed (kg VS/d)"],olr:row["OLR (kg VS/m3/d)"]}));
  return {id:`task1:${pathway}`,label:`Task 1 · ${pathway} · ${source[0].Intervention}`,source:"Supported rows from the 200-scenario production workbook",sourceRows:rows.length,
    fields:ranges([...common,{key:"feedRate",label:"Feed rate",unit:"kg VS/day",min:null,max:null},{key:"olr",label:"Organic loading",unit:"kg VS/m³/day",min:null,max:null}],rows),example:rows[0]};
});
const task2Contexts:CoverageContext[]=[...new Set(task2Rows.map(row=>row.pathway))].sort().map(pathway=>{
  const source=task2Rows.filter(row=>row.pathway===pathway),unresolved=source.some(row=>row.olrBasis==="UNRESOLVED_COD_VS");
  const rows:ScenarioValues[]=source.map(row=>({hrtHours:row.hrtHours,temperatureC:row.temperatureC,ph:row.ph,srtDays:row.srtDays,upflowMHour:row.upflowMHour,olr:row.olr}));
  const fields=ranges([...common,{key:"srtDays",label:"Sludge retention time",unit:"days",min:null,max:null},{key:"upflowMHour",label:"Upflow velocity",unit:"m/h",min:null,max:null},{key:"olr",label:"Organic loading",unit:unresolved?"COD/VS unresolved":"kg COD/m³/day",min:null,max:null}],rows);
  if(unresolved){const field=fields.find(field=>field.key==="olr")!;field.min=null;field.max=null;field.note="The source gives conflicting COD/VS units. A loading-range check is unavailable.";}
  return {id:`task2:${pathway}`,label:`Task 2 · ${pathway} · ${source[0].technology}`,source:"Observed inputs in the Task 2 workbook; baseline references and requested limits are not operating inputs",sourceRows:source.length,fields,example:rows[0]};
});
const sameTankContexts:CoverageContext[]=sameTankModel.stageInfo.map(stage=>({id:`task1:same-tank:${stage.id}`,label:`Same-tank production · ${stage.id} · ${stage.label}`,source:sameTankModel.source.file,sourceRows:stage.count,fields:[...common,{key:"srtDays" as const,label:"Sludge retention time",unit:"days",min:null,max:null}].map((field,i)=>({...field,min:stage.min[i],max:stage.max[i]})),example:{hrtHours:(stage.min[0]+stage.max[0])/2,temperatureC:stage.min[1],ph:(stage.min[2]+stage.max[2])/2,srtDays:(stage.min[3]+stage.max[3])/2}}));
const contexts:CoverageContext[]=[...sameTankContexts,...pairedContexts,{id:"hours",label:"Existing HRT trajectory · 2–24 hours",source:"Fitted hours-model input coverage",sourceRows:hoursModel.fitRows,
  fields:[{key:"hrtHours",label:"HRT",unit:"h",min:hoursModel.input.min,max:hoursModel.input.max}],example:{hrtHours:24}},...task2Contexts];
const version="scenario-input-coverage-2026-11-10-v3";
export const scenarioCoverageCatalog:ScenarioCoverageCatalog={version,catalogHash:fingerprint({version,contexts}),contexts,meaning};

export function checkScenarioInputs(raw:unknown):ScenarioInputCheck{
  const data=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
  const context=contexts.find(item=>item.id===data.contextId),issues:{field:string;message:string}[]=[];
  if(!context)issues.push({field:"contextId",message:"Select a supported scenario pathway"});
  const stream=data.stream;
  if(!["task1","task2","manual"].includes(String(stream)))issues.push({field:"stream",message:"A scenario source is required"});
  if(stream==="task1"&&context&&!context.id.startsWith("task1:")&&context.id!=="hours"||stream==="task2"&&context&&!context.id.startsWith("task2:"))issues.push({field:"contextId",message:"Pathway does not match the scenario source"});
  const values=data.values&&typeof data.values==="object"&&!Array.isArray(data.values)?data.values as Record<string,unknown>:{};
  if(!data.values||typeof data.values!=="object"||Array.isArray(data.values))issues.push({field:"values",message:"Scenario input values are required"});
  for(const [key,value] of Object.entries(values)){
    if(context&&!context.fields.some(field=>field.key===key))issues.push({field:key,message:"This field is not an input for the selected pathway"});
    if(value!==null&&(typeof value!=="number"||!Number.isFinite(value)||Math.abs(value)>1e12))issues.push({field:key,message:"Enter a finite numeric value in the displayed units, or leave it blank"});
  }
  if(data.sampleLabel!==undefined&&(typeof data.sampleLabel!=="string"||data.sampleLabel.length>160))issues.push({field:"sampleLabel",message:"Scenario label must be at most 160 characters"});
  if(data.runId!==undefined&&(typeof data.runId!=="string"||!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(data.runId)))issues.push({field:"runId",message:"Invalid saved run ID"});
  if(issues.length)throw new InputError(issues);
  const fields=context!.fields.map(field=>{
    const value=(values[field.key]??null) as number|null;
    const tolerance=1e-9; // Ignore interpolation round-off at source endpoints.
    const status=value===null?"MISSING":field.min===null||field.max===null?"UNAVAILABLE":value<field.min-tolerance||value>field.max+tolerance?"OUTSIDE":"WITHIN";
    return {...field,value,status} as ScenarioInputCheck["fields"][number];
  });
  const outsideCount=fields.filter(field=>field.status==="OUTSIDE").length,uncheckedCount=fields.filter(field=>["MISSING","UNAVAILABLE"].includes(field.status)).length;
  return {id:crypto.randomUUID(),checkedAt:new Date().toISOString(),catalogHash:scenarioCoverageCatalog.catalogHash,stream:stream as ScenarioStream,contextId:context!.id,contextLabel:context!.label,sampleLabel:typeof data.sampleLabel==="string"?data.sampleLabel:"Scenario input check",runId:typeof data.runId==="string"?data.runId:null,dataSource:"SCENARIO_DATA",fields,
    status:outsideCount?"OUT_OF_RANGE":uncheckedCount?"PARTIAL_CHECK":"WITHIN_SCENARIO_RANGES",outsideCount,uncheckedCount,meaning};
}
