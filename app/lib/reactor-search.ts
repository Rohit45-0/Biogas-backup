import manifest from "../../ai-workflow/research/reactor-study-2026-11-09/source-manifest.json";
import sourceRows from "../../ai-workflow/research/reactor-study-2026-11-09/scenarios.json";
import artifact from "../../ai-workflow/research/reactor-study-2026-11-09/model.json";
import assessment from "../../ai-workflow/research/reactor-study-2026-11-09/model-assessment.json";
import {fingerprint} from "./evidence";
import {InputError} from "./inputs";
import {reactorMetadata,reactorDefaults,resolveReactorRequest,calculateReactorStudy,predictReactorScenario,sourceBeforeBaseline,reactorDataHash,reactorModelHash,reactorProductionKeys,type ReactorRequest,type ReactorBaseline,type ReactorCandidate,type ReactorOutputs} from "./reactor-optimization";
import {generateReactorInputs,predictGeneratedReactor,reactorGeneration,type GeneratedReactorInput} from "./reactor-scenario-generator";
import type {Production} from "./hrt-optimization";

export type ReactorSearchRequest=ReactorRequest&{generationSeed:string|null};
export type GeneratedReactorCandidate=GeneratedReactorInput&{outputs:ReactorOutputs;sourceOutputs:null;predictionBasis:"model";comparable:boolean;eligible:boolean;reasons:string[];gains:Production;minimumGainPct:number|null;timeSavedHours:number;hrtReductionPct:number};
export type ReactorSearchCandidate=GeneratedReactorCandidate|ReactorCandidate;
export const reactorSearchVersion="reactor-search-2026-11-10-v3";
export function reactorSearchMetadata(){const original=reactorMetadata();return {...original,version:reactorSearchVersion,defaults:{...reactorDefaults,mode:"source_baseline",method:"source",baseline:{origin:"workbook"},generationSeed:null} as ReactorSearchRequest,sourceBeforeReferences:Object.fromEntries(original.technologies.map(t=>[t.id,sourceBeforeBaseline(t.id)])),generation:reactorGeneration,candidateCount:reactorGeneration.candidateCount,model:{...original.model,scope:reactorGeneration.scope},generationMeaning:"Generate 2,000 distinct operating-input combinations inside the same reactor's source bounds, then predict each with the fitted model. These are inference candidates, not additional training observations."};}

export function resolveReactorSearchRequest(raw:unknown):ReactorSearchRequest{
 const request=resolveReactorRequest(raw),data=raw as Record<string,unknown>,seed=data.generationSeed;
 if(seed!==undefined&&seed!==null&&(typeof seed!=="string"||!/^[a-zA-Z0-9-]{8,96}$/.test(seed)))throw new InputError([{field:"generationSeed",message:"Use 8–96 letters, digits or hyphens for a replay seed"}]);
 if(request.method==="model"&&!seed)throw new InputError([{field:"generationSeed",message:"Generated model comparisons require a saved replay seed"}]);
 return {...request,generationSeed:request.method==="model"?seed as string:null};
}

function baselineFor(request:ReactorSearchRequest):ReactorBaseline{
 if(request.mode==="source_baseline")return sourceBeforeBaseline(request.technology);
 const b=request.baseline,context=sourceRows.find(row=>row.pathway===request.technology)!;
 if(b.origin==="scenario"){const row=sourceRows.find(row=>row.id===b.scenarioId)!,prediction=predictReactorScenario(row);return {origin:b.origin,scenarioId:row.id,hrtHours:row.hrtHours,pathway:row.pathway,technology:row.technology,configuration:row.configuration,scenario:row,biogasM3Day:prediction.biogasM3Day,methaneM3Day:prediction.methaneM3Day,electricityKwhDay:prediction.electricityKwhDay,meaning:"Baseline is the fitted model's prediction at the explicitly selected starting scenario. Generated candidates use the same fitted reactor model; the starting baseline stays fixed throughout the run."};}
 if(b.origin==="workbook")return {origin:b.origin,scenarioId:null,hrtHours:manifest.workbookReference.hrtHours,pathway:"CONVENTIONAL_CSTR",technology:manifest.workbookReference.technology,configuration:"Conventional mesophilic CSTR",scenario:null,biogasM3Day:manifest.workbookReference.biogasM3Day,methaneM3Day:manifest.workbookReference.methaneM3Day,electricityKwhDay:manifest.workbookReference.electricityKwhDay,meaning:"Fixed conventional CSTR reference for a technology-upgrade comparison."};
 return {...b,scenarioId:null,pathway:context.pathway,technology:context.technology,configuration:context.configuration,scenario:null,meaning:"User-entered daily operating values for this reactor configuration. After values are model estimates, not measured improvement."};
}

export function calculateReactorSearch(raw:unknown){
 const request=resolveReactorSearchRequest(raw);
 if(request.method==="source"){
  const original=calculateReactorStudy(request);
  return {...original,version:reactorSearchVersion,request,candidates:original.candidates as ReactorSearchCandidate[],selected:original.selected as ReactorSearchCandidate|null,trainingSourceCount:sourceRows.length,generation:{version:reactorGeneration.version,seed:null,poolHash:fingerprint(original.candidates.map(c=>c.id)),scope:"SOURCE_RECORDS",candidateCount:original.candidateCount},sameTechnologyCandidateCount:original.sameTechnologyCount};
 }
 const baseline=baselineFor(request),c=request.constraints,inputs=generateReactorInputs(request,request.generationSeed!);
 const floors=Object.fromEntries(reactorProductionKeys.map(key=>[key,request.minimumOutputs[key]??baseline[key]])) as Production;
 const candidates:ReactorSearchCandidate[]=inputs.map(input=>{
  const outputs=predictGeneratedReactor(input),reasons:string[]=[],comparable=request.mode==="source_baseline"?input.pathway===request.technology:request.mode==="upgrade"||input.pathway===baseline.pathway&&input.configuration===baseline.configuration;
  if(!comparable)reasons.push("Different reactor technology or configuration");
  if(request.feed==="solids"&&["H1","H2","H3"].includes(input.pathway))reasons.push("Hourly high-rate pathway does not support untreated solid-rich feed in this dataset");
  if(input.hrtHours>=baseline.hrtHours)reasons.push("Does not reduce baseline HRT");
  if(c.maxHrtHours!==null&&input.hrtHours>c.maxHrtHours)reasons.push("Above requested HRT maximum");
  if(c.minSrtDays!==null&&input.srtDays<c.minSrtDays)reasons.push("Below requested SRT minimum");
  if(c.temperatureMinC!==null&&input.temperatureC<c.temperatureMinC||c.temperatureMaxC!==null&&input.temperatureC>c.temperatureMaxC)reasons.push("Outside requested temperature range");
  if(c.phMin!==null&&input.ph<c.phMin||c.phMax!==null&&input.ph>c.phMax)reasons.push("Outside requested pH range");
  if(c.olrMax!==null){if(input.olrBasis!==c.olrBasis)reasons.push(input.olrBasis==="UNRESOLVED_COD_VS"?"Source COD/VS loading unit conflict is unresolved":"Loading basis does not match");else if(input.olr>c.olrMax)reasons.push("Above requested organic loading maximum");}
  for(const key of reactorProductionKeys){if(floors[key]!==null&&outputs[key]<floors[key]!)reasons.push(`Below ${key} production minimum`);if(request.mode==="same_reactor"&&baseline[key]!==null&&outputs[key]<=baseline[key]!+1e-9)reasons.push(`No increase in ${key} against this reactor's baseline`);}
  const gains=Object.fromEntries(reactorProductionKeys.map(key=>[key,!comparable||baseline[key]===null||baseline[key]===0?null:(outputs[key]/baseline[key]!-1)*100])) as Production,known=Object.values(gains).filter((v):v is number=>v!==null);
  return {...input,outputs,sourceOutputs:null,predictionBasis:"model" as const,comparable,eligible:!reasons.length,reasons,gains,minimumGainPct:known.length?Math.min(...known):null,timeSavedHours:baseline.hrtHours-input.hrtHours,hrtReductionPct:(baseline.hrtHours-input.hrtHours)/baseline.hrtHours*100};
 }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||Number(b.comparable)-Number(a.comparable)||a.hrtHours-b.hrtHours||(b.minimumGainPct??-Infinity)-(a.minimumGainPct??-Infinity)||a.id.localeCompare(b.id));
 const selected=candidates.find(row=>row.eligible)??null,eligibleCount=candidates.filter(row=>row.eligible).length;
 const annual=(point:Production)=>Object.fromEntries(reactorProductionKeys.map(key=>[key,point[key]===null?null:point[key]!*365])) as Production;
 const warnings=["Planning simulation data. Plant performance is not validated and no equipment is controlled.",assessment.reason,"Generated inputs interpolate neighbouring source inputs within one reactor configuration. Staying inside these ranges does not establish plant suitability or prove that changing inputs causes a production gain.","Gross electricity excludes heating, pretreatment, pumping and membrane loads.",baseline.meaning];
 if(request.mode!=="same_reactor")warnings.push("Technology upgrades can change equipment or pretreatment; their gains are not attributed to AI-only operating changes.");
 if(request.feed==="unknown")warnings.push("Feed compatibility is unspecified; choosing a pathway does not establish suitability for the plant feed.");
 if(baseline.pathway.startsWith("C")||selected?.pathway.startsWith("C"))warnings.push("CSTR loading units conflict in the supplied source. COD/VS remains unresolved and is excluded from CSTR model features.");
 const generation={version:reactorGeneration.version,seed:request.generationSeed,poolHash:fingerprint(inputs),scope:request.mode!=="upgrade"?"SELECTED_REACTOR":"ALL_REACTOR_TECHNOLOGIES",candidateCount:inputs.length};
 const trace=[{label:"Validate study inputs",detail:`${request.mode}; ${request.technology}; model prediction`},{label:"Resolve the starting baseline",detail:baseline.scenarioId??baseline.origin},{label:"Generate 2,000 distinct candidate inputs",detail:`${generation.version}; seed ${generation.seed}; ${generation.scope}; ${sourceRows.length} training records`},{label:"Run the trained reactor model",detail:`${inputs.length} predictions; ${artifact.version}; methane and electricity derived from fitted biogas and methane content`},{label:"Apply reactor and operating constraints",detail:`${eligibleCount} qualifying candidates`},{label:"Select minimum qualifying HRT",detail:selected?.id??"No qualifying scenario"},{label:"Calculate before/after KPIs",detail:"Daily production, HRT change and annual projections use one saved baseline and candidate"}];
 return {version:reactorSearchVersion,dataHash:reactorDataHash,modelVersion:artifact.version,modelHash:reactorModelHash,method:"EXPLORATORY_REACTOR_ML" as const,status:selected?"QUALIFIED" as const:"NO_QUALIFYING_CANDIDATE" as const,request,baseline,floors,selected,candidates,candidateCount:candidates.length,eligibleCount,sameTechnologyCount:sourceRows.filter(row=>row.pathway===request.technology).length,sameTechnologyCandidateCount:candidates.filter(row=>row.pathway===request.technology).length,trainingSourceCount:sourceRows.length,generatedCandidateCount:candidates.length,modelPredictionEnabled:true,sources:manifest.sources,generation,assessment:{performanceGatePassed:assessment.performanceGatePassed,plantValidated:false,scope:reactorGeneration.scope},annual:{baseline:annual(baseline),selected:selected?annual(selected.outputs):null},hrtChangeHours:selected?selected.hrtHours-baseline.hrtHours:null,warnings,trace};
}
export type ReactorSearchCalculation=ReturnType<typeof calculateReactorSearch>;
export const reactorSearchOutputHash=(r:ReactorSearchCalculation)=>fingerprint({version:r.version,dataHash:r.dataHash,modelHash:r.modelHash,request:r.request,status:r.status,baseline:r.baseline,floors:r.floors,selected:r.selected,candidates:r.candidates,generation:r.generation,annual:r.annual,trace:r.trace});
