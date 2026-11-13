import manifest from "../../ai-workflow/research/reactor-study-2026-11-09/source-manifest.json";
import sourceRows from "../../ai-workflow/research/reactor-study-2026-11-09/scenarios.json";
import artifact from "../../ai-workflow/research/reactor-study-2026-11-09/model.json";
import assessment from "../../ai-workflow/research/reactor-study-2026-11-09/model-assessment.json";
import {fingerprint} from "./evidence";
import {InputError} from "./inputs";
import {reactorSourceRecord,reactorSourceReference,type ReactorSourceProvenance} from "./reactor-source-reference";
import type {Production,ProductionKey,HrtStudyConstraints} from "./hrt-optimization";

export const reactorProductionKeys:ProductionKey[]=["biogasM3Day","methaneM3Day","electricityKwhDay"];
export type ReactorScenario=typeof sourceRows[number];
export type ReactorOutputs=ReactorScenario["outputs"];
export type ReactorMethod="model"|"source";
export type ReactorBaselineInput={origin:"scenario";scenarioId:string}|{origin:"workbook"}|({origin:"provided";hrtHours:number}&Production);
export type ReactorRequest={mode:"source_baseline"|"same_reactor"|"upgrade";method:ReactorMethod;technology:string;feed:"unknown"|"soluble"|"solids";baseline:ReactorBaselineInput;minimumOutputs:Production;constraints:HrtStudyConstraints};
export type ReactorBaseline=Production&{origin:ReactorBaselineInput["origin"];scenarioId:string|null;hrtHours:number;pathway:string;technology:string;configuration:string;meaning:string;scenario:ReactorScenario|null;sourceReference?:ReactorSourceProvenance};
export type ReactorCandidate=ReactorScenario&{sourceOutputs:ReactorOutputs;predictionBasis:ReactorMethod;comparable:boolean;eligible:boolean;reasons:string[];gains:Production;minimumGainPct:number|null;timeSavedHours:number|null;hrtReductionPct:number|null};
type RidgeModel={features:string[];fit:{mean:number[];scale:number[];coefficients:number[][];alpha:number}};
const models=artifact.models as Record<string,RidgeModel>;
const empty:Production={biogasM3Day:null,methaneM3Day:null,electricityKwhDay:null};
export const reactorDefaults:ReactorRequest={mode:"same_reactor",method:"model",technology:"H1",feed:"unknown",baseline:{origin:"scenario",scenarioId:manifest.technologies.find(t=>t.id==="H1")!.defaultBaselineId},minimumOutputs:{...empty},constraints:{maxHrtHours:null,minSrtDays:null,temperatureMinC:null,temperatureMaxC:null,phMin:null,phMax:null,olrMax:null,olrBasis:null}};
export const reactorDataHash=fingerprint({manifest,sourceRows});
export const reactorModelHash=fingerprint(artifact);
export function predictReactorScenario(row:ReactorScenario):ReactorOutputs{
  const model=models[row.pathway];
  if(!model)throw new Error("Unsupported reactor pathway");
  const values=row as unknown as Record<string,unknown>;
  const z=[1,...model.features.map((key,index)=>(Number(values[key])-model.fit.mean[index])/model.fit.scale[index])];
  const [biogasM3Day,methanePct]=[0,1].map(target=>z.reduce((sum,value,index)=>sum+value*model.fit.coefficients[index][target],0));
  if(!Number.isFinite(biogasM3Day)||biogasM3Day<=0||!Number.isFinite(methanePct)||methanePct<=0||methanePct>100)throw new Error("Invalid model output");
  const methaneM3Day=biogasM3Day*methanePct/100,electricityKwhDay=methaneM3Day*manifest.energy.methaneKwhM3*manifest.energy.electricalEfficiency;
  return {biogasM3Day,methanePct,methaneM3Day,electricityKwhDay,annualElectricityKwh:electricityKwhDay*365};
}
export function reactorMetadata(){return {version:manifest.version,dataHash:reactorDataHash,modelHash:reactorModelHash,sources:manifest.sources,sourceCount:sourceRows.length,technologies:manifest.technologies,
  defaults:reactorDefaults,energy:manifest.energy,workbookReference:manifest.workbookReference,calculationBasis:manifest.calculationBasis,assessment,model:{version:artifact.version,algorithm:artifact.algorithm,scope:artifact.scope,trainingRows:artifact.trainingRows,models:Object.fromEntries(Object.entries(artifact.models).map(([key,value])=>[key,{features:value.features,trainingRows:value.trainingRows}]))},
  baselineOptions:sourceRows.map(row=>({...row,predictedOutputs:predictReactorScenario(row)}))};}

function object(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
export function resolveReactorRequest(raw:unknown):ReactorRequest{
  const data=object(raw),base=object(data.baseline),floors=object(data.minimumOutputs),limits=object(data.constraints),issues:{field:string;message:string}[]=[];
  function choice<T extends string>(value:unknown,allowed:readonly T[],field:string):T{if(typeof value!=="string"||!allowed.includes(value as T)){issues.push({field,message:`Choose ${allowed.join(", ")}`});return allowed[0];}return value as T;}
  function numeric(value:unknown,field:string,nullable=true,min=0,max=1e12):number|null{if(value==null&&nullable)return null;if(typeof value!=="number"||!Number.isFinite(value)||value<min||value>max){issues.push({field,message:`Enter a finite number from ${min} to ${max}`});return null;}return value;}
  const mode=choice(data.mode,["same_reactor","upgrade","source_baseline"] as const,"mode"),method=choice(data.method,["model","source"] as const,"method"),technology=choice(data.technology,manifest.technologies.map(t=>t.id),"technology"),feed=choice(data.feed,["unknown","soluble","solids"] as const,"feed");
  const origin=choice(base.origin,["scenario","workbook","provided"] as const,"baseline.origin");
  if(mode==="source_baseline"&&origin!=="workbook")issues.push({field:"baseline.origin",message:"Source BEFORE comparison requires the original source reference"});
  let baseline:ReactorBaselineInput;
  if(origin==="scenario"){
    const source=sourceRows.find(row=>row.id===base.scenarioId);
    if(!source)issues.push({field:"baseline.scenarioId",message:"Choose an existing source scenario"});
    if(source&&source.pathway!==technology)issues.push({field:"baseline.scenarioId",message:"The starting scenario must belong to the selected reactor technology"});
    baseline={origin,scenarioId:typeof base.scenarioId==="string"?base.scenarioId:""};
  }else if(origin==="workbook"){
    baseline={origin};if(mode==="same_reactor")issues.push({field:"baseline.origin",message:"The conventional CSTR reference is only available for technology upgrades. Select a starting scenario for this reactor."});
  }else{
    baseline={origin,hrtHours:numeric(base.hrtHours,"baseline.hrtHours",false,.001)??0,...Object.fromEntries(reactorProductionKeys.map(key=>[key,numeric(base[key],`baseline.${key}`)])) as Production};
    if(reactorProductionKeys.every(key=>baseline.origin==="provided"&&baseline[key]===null))issues.push({field:"baseline",message:"Provide at least one daily production baseline"});
    if(baseline.methaneM3Day!==null&&baseline.biogasM3Day!==null&&baseline.methaneM3Day>baseline.biogasM3Day)issues.push({field:"baseline.methaneM3Day",message:"Methane volume cannot exceed biogas volume"});
    for(const key of reactorProductionKeys)if(baseline[key]!==null&&baseline[key]!>0&&baseline[key]!<1e-6)issues.push({field:`baseline.${key}`,message:"Use zero or at least 0.000001 in the displayed units"});
  }
  const minimumOutputs=Object.fromEntries(reactorProductionKeys.map(key=>[key,numeric(floors[key],`minimumOutputs.${key}`)])) as Production;
  const constraints:HrtStudyConstraints={maxHrtHours:numeric(limits.maxHrtHours,"maxHrtHours",true,.001),minSrtDays:numeric(limits.minSrtDays,"minSrtDays"),temperatureMinC:numeric(limits.temperatureMinC,"temperatureMinC",true,-273.15),temperatureMaxC:numeric(limits.temperatureMaxC,"temperatureMaxC",true,-273.15),phMin:numeric(limits.phMin,"phMin",true,0,14),phMax:numeric(limits.phMax,"phMax",true,0,14),olrMax:numeric(limits.olrMax,"olrMax"),olrBasis:limits.olrBasis==null?null:choice(limits.olrBasis,["COD","VS"] as const,"olrBasis")};
  if(constraints.temperatureMinC!==null&&constraints.temperatureMaxC!==null&&constraints.temperatureMinC>constraints.temperatureMaxC)issues.push({field:"temperature",message:"Minimum exceeds maximum"});
  if(constraints.phMin!==null&&constraints.phMax!==null&&constraints.phMin>constraints.phMax)issues.push({field:"pH",message:"Minimum exceeds maximum"});
  if(constraints.olrMax!==null&&constraints.olrBasis===null)issues.push({field:"olrBasis",message:"Choose the loading unit basis"});
  if(issues.length)throw new InputError(issues);
  return {mode,method,technology,feed,baseline,minimumOutputs,constraints};
}

export function sourceBeforeBaseline(technology:string):ReactorBaseline{
  const source=reactorSourceReference(technology);
  return {origin:"workbook",scenarioId:source.id,...source.before,pathway:"CONVENTIONAL_CSTR",technology:manifest.workbookReference.technology,configuration:"Conventional mesophilic CSTR",scenario:null,sourceReference:source.provenance,
    meaning:`BEFORE values read from the supplied source columns in hours. ${source.provenance.file}, ${source.provenance.sheet}, row ${source.provenance.row}. This is the conventional CSTR reference, not an already-optimized scenario.`};
}

function baselineFor(request:ReactorRequest):ReactorBaseline{
  if(request.mode==="source_baseline")return sourceBeforeBaseline(request.technology);
  const b=request.baseline,technology=manifest.technologies.find(t=>t.id===request.technology)!,context=sourceRows.find(row=>row.pathway===request.technology)!;
  if(b.origin==="scenario"){
    const row=sourceRows.find(row=>row.id===b.scenarioId)!,out=request.method==="model"?predictReactorScenario(row):row.outputs;
    return {origin:b.origin,scenarioId:row.id,hrtHours:row.hrtHours,pathway:row.pathway,technology:row.technology,configuration:row.configuration,scenario:row,...Object.fromEntries(reactorProductionKeys.map(key=>[key,out[key]])) as Production,
      meaning:request.method==="model"?"Baseline is this reactor's model prediction at the explicitly selected starting scenario. After values use the same fitted model.":"Baseline is the explicitly selected planning scenario for this reactor; after values are another source scenario."};
  }
  if(b.origin==="workbook")return {origin:b.origin,scenarioId:null,hrtHours:manifest.workbookReference.hrtHours,pathway:"CONVENTIONAL_CSTR",technology:manifest.workbookReference.technology,configuration:"Conventional mesophilic CSTR",scenario:null,...Object.fromEntries(reactorProductionKeys.map(key=>[key,manifest.workbookReference[key]])) as Production,meaning:"Fixed conventional CSTR reference for a technology-upgrade comparison."};
  return {...b,scenarioId:null,pathway:technology.id,technology:technology.name,configuration:context.configuration,scenario:null,meaning:"User-entered daily operating values for the selected reactor configuration. After values are estimates, not measured improvement."};
}

export function calculateReactorStudy(raw:unknown){
  const request=resolveReactorRequest(raw),baseline=baselineFor(request),c=request.constraints;
  const floors=Object.fromEntries(reactorProductionKeys.map(key=>[key,request.minimumOutputs[key]??baseline[key]])) as Production;
  const candidates:ReactorCandidate[]=sourceRows.map(row=>{
    const outputs=request.method==="model"?predictReactorScenario(row):request.mode==="source_baseline"?reactorSourceRecord(row.id).after:row.outputs,reasons:string[]=[];
    const comparable=request.mode==="source_baseline"?row.pathway===request.technology:request.mode==="upgrade"||row.pathway===baseline.pathway&&row.configuration===baseline.configuration;
    if(!comparable)reasons.push("Different reactor technology or configuration");
    if(request.feed==="solids"&&["H1","H2","H3"].includes(row.pathway))reasons.push("Hourly high-rate pathway does not support untreated solid-rich feed in this dataset");
    if(row.hrtHours>=baseline.hrtHours)reasons.push("Does not reduce baseline HRT");
    if(c.maxHrtHours!==null&&row.hrtHours>c.maxHrtHours)reasons.push("Above requested HRT maximum");
    if(c.minSrtDays!==null&&row.srtDays<c.minSrtDays)reasons.push("Below requested SRT minimum");
    if(c.temperatureMinC!==null&&row.temperatureC<c.temperatureMinC||c.temperatureMaxC!==null&&row.temperatureC>c.temperatureMaxC)reasons.push("Outside requested temperature range");
    if(c.phMin!==null&&row.ph<c.phMin||c.phMax!==null&&row.ph>c.phMax)reasons.push("Outside requested pH range");
    if(c.olrMax!==null){if(row.olrBasis!==c.olrBasis)reasons.push(row.olrBasis==="UNRESOLVED_COD_VS"?"Source COD/VS loading unit conflict is unresolved":"Loading basis does not match");else if(row.olr>c.olrMax)reasons.push("Above requested organic loading maximum");}
    for(const key of reactorProductionKeys){
      if(floors[key]!==null&&outputs[key]<floors[key]!)reasons.push(`Below ${key} production minimum`);
      if(request.mode==="same_reactor"&&baseline[key]!==null&&outputs[key]<=baseline[key]!+1e-9)reasons.push(`No increase in ${key} against this reactor's baseline`);
    }
    const gains=Object.fromEntries(reactorProductionKeys.map(key=>[key,!comparable||baseline[key]===null||baseline[key]===0?null:(outputs[key]/baseline[key]!-1)*100])) as Production;
    const known=Object.values(gains).filter((value):value is number=>value!==null);
    return {...row,sourceOutputs:request.mode==="source_baseline"?reactorSourceRecord(row.id).after:row.outputs,outputs,predictionBasis:request.method,comparable,eligible:!reasons.length,reasons,gains,minimumGainPct:known.length?Math.min(...known):null,
      timeSavedHours:comparable?baseline.hrtHours-row.hrtHours:null,hrtReductionPct:comparable?(baseline.hrtHours-row.hrtHours)/baseline.hrtHours*100:null};
  }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||Number(b.comparable)-Number(a.comparable)||a.hrtHours-b.hrtHours||(b.minimumGainPct??-Infinity)-(a.minimumGainPct??-Infinity)||a.id.localeCompare(b.id));
  const selected=candidates.find(row=>row.eligible)??null;
  const annual=(point:Production)=>Object.fromEntries(reactorProductionKeys.map(key=>[key,point[key]===null?null:point[key]!*365])) as Production;
  const warnings=["Planning simulation data. Plant performance is not validated and no equipment is controlled.","Gross electricity excludes heating, pretreatment, pumping and membrane loads.",baseline.meaning];
  if(request.method==="model")warnings.push(assessment.reason,"The comparison uses fitted predictions at existing source input combinations. It does not establish that the recommended input changes cause the predicted gain.");
  else warnings.push("This comparison uses recorded workbook scenario outputs. It is not a generated ML prediction.");
  if(request.mode!=="same_reactor")warnings.push("Technology upgrades can change reactor equipment or pretreatment; their gains are not attributed to AI-only operating changes.");
  if(request.feed==="unknown")warnings.push("Feed compatibility is unspecified; choosing a pathway does not establish suitability for the plant feed.");
  if((baseline.pathway.startsWith("C")||selected?.pathway.startsWith("C"))&&baseline.pathway!=="CONVENTIONAL_CSTR")warnings.push("CSTR loading units conflict between the source header and assumptions. COD/VS remains unresolved and is excluded from the CSTR prediction features.");
  const trace=[{label:"Validate study inputs",detail:`${request.mode}; ${request.technology}; ${request.method}`},{label:"Resolve the starting baseline",detail:baseline.scenarioId??baseline.origin},{label:"Evaluate source inputs",detail:`${sourceRows.length} retained source records; ${request.method==="model"?artifact.algorithm:"canonical workbook outputs"}`},{label:"Apply reactor and operating constraints",detail:`${candidates.filter(row=>row.eligible).length} qualifying scenarios`},{label:"Select minimum qualifying HRT",detail:selected?.id??"No qualifying scenario"},{label:"Calculate before/after KPIs",detail:"Daily values, HRT change, percentage changes and 365-day projections share one calculation"}];
  return {version:manifest.version,dataHash:reactorDataHash,modelVersion:artifact.version,modelHash:reactorModelHash,method:request.method==="model"?"EXPLORATORY_REACTOR_ML" as const:"SOURCE_SCENARIO_COMPARISON" as const,
    status:selected?"QUALIFIED" as const:"NO_QUALIFYING_CANDIDATE" as const,request,baseline,floors,selected,candidates,candidateCount:400,eligibleCount:candidates.filter(row=>row.eligible).length,
    sameTechnologyCount:sourceRows.filter(row=>row.pathway===request.technology).length,generatedCandidateCount:0,modelPredictionEnabled:request.method==="model",sources:manifest.sources,
    assessment:{performanceGatePassed:assessment.performanceGatePassed,plantValidated:false,scope:artifact.scope},annual:{baseline:annual(baseline),selected:selected?annual(selected.outputs):null},hrtChangeHours:selected?selected.hrtHours-baseline.hrtHours:null,warnings,trace};
}
export type ReactorCalculation=ReturnType<typeof calculateReactorStudy>;
export const reactorOutputHash=(value:ReactorCalculation)=>fingerprint({version:value.version,dataHash:value.dataHash,modelHash:value.modelHash,method:value.method,request:value.request,status:value.status,baseline:value.baseline,floors:value.floors,selected:value.selected,candidates:value.candidates,annual:value.annual,hrtChangeHours:value.hrtChangeHours,trace:value.trace});
