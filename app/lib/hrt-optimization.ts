import manifest from "../../ai-workflow/research/hrt-optimization-2026-11-08/source-manifest.json";
import sourceScenarios from "../../ai-workflow/research/hrt-optimization-2026-11-08/scenarios.json";
import assessment from "../../ai-workflow/research/hrt-optimization-2026-11-08/model-assessment.json";
import {fingerprint} from "./evidence";
import {InputError} from "./inputs";

export type ProductionKey="biogasM3Day"|"methaneM3Day"|"electricityKwhDay";
export const productionKeys:ProductionKey[]=["biogasM3Day","methaneM3Day","electricityKwhDay"];
export type Production=Record<ProductionKey,number|null>;
export type HrtStudyScenario=typeof sourceScenarios[number];
export type HrtStudyBaseline=Production&{origin:"workbook"|"provided";hrtHours:number};
export type HrtStudyConstraints={maxHrtHours:number|null;minSrtDays:number|null;temperatureMinC:number|null;temperatureMaxC:number|null;phMin:number|null;phMax:number|null;olrMax:number|null;olrBasis:"COD"|"VS"|null};
export type HrtStudyRequest={mode:"technology"|"upgrade";technology:string;feed:"unknown"|"soluble"|"solids";
  baseline:HrtStudyBaseline;minimumOutputs:Production;constraints:HrtStudyConstraints};
export type HrtStudyCandidate=HrtStudyScenario&{eligible:boolean;reasons:string[];gains:Production;minimumGainPct:number|null;timeSavedHours:number;hrtReductionPct:number};

const emptyProduction:Production={biogasM3Day:null,methaneM3Day:null,electricityKwhDay:null};
export const hrtStudyDefaults:HrtStudyRequest={mode:"technology",technology:"H1",feed:"unknown",
  baseline:{origin:"workbook",hrtHours:manifest.baseline.hrtHours,...Object.fromEntries(productionKeys.map(key=>[key,manifest.baseline[key]])) as Record<ProductionKey,number>},
  minimumOutputs:{...emptyProduction},constraints:{maxHrtHours:null,minSrtDays:null,temperatureMinC:null,temperatureMaxC:null,phMin:null,phMax:null,olrMax:null,olrBasis:null}};
export const hrtStudyDataHash=fingerprint({manifest,sourceScenarios,assessment});
export function hrtStudyMetadata(){return {version:manifest.version,dataHash:hrtStudyDataHash,source:manifest.primarySource,
  sources:manifest.sources,technologies:manifest.technologies,defaults:hrtStudyDefaults,
  calculationBasis:manifest.calculationBasis,energy:manifest.energy,assessment,
  method:"SOURCE_SCENARIO_RANKING",candidateCount:sourceScenarios.length};}

function object(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
export function resolveHrtStudyRequest(value:unknown):HrtStudyRequest{
  const data=object(value),base=object(data.baseline),floors=object(data.minimumOutputs),limits=object(data.constraints);
  const issues:{field:string;message:string}[]=[];
  function choice<T extends string>(raw:unknown,allowed:readonly T[],field:string):T{
    if(typeof raw!=="string"||!allowed.includes(raw as T)){issues.push({field,message:`Choose ${allowed.join(", ")}`});return allowed[0];}return raw as T;
  }
  function numeric(raw:unknown,field:string,nullable=true,min=0,max=1e12):number|null{
    if((raw===undefined||raw===null)&&nullable)return null;
    if(typeof raw!=="number"||!Number.isFinite(raw)||raw<min||raw>max){issues.push({field,message:`Enter a finite number from ${min} to ${max===Number.MAX_VALUE?"the supported numeric limit":max}`});return null;}return raw;
  }
  const mode=choice(data.mode,["technology","upgrade"],"mode"),technology=choice(data.technology,manifest.technologies.map(t=>t.id),"technology"),feed=choice(data.feed,["unknown","soluble","solids"],"feed");
  const origin=choice(base.origin,["workbook","provided"],"baseline.origin");
  const baseline:HrtStudyBaseline=origin==="workbook"?{...hrtStudyDefaults.baseline}:{origin,
    hrtHours:numeric(base.hrtHours,"baseline.hrtHours",false,.001)??0,
    biogasM3Day:numeric(base.biogasM3Day,"baseline.biogasM3Day"),methaneM3Day:numeric(base.methaneM3Day,"baseline.methaneM3Day"),electricityKwhDay:numeric(base.electricityKwhDay,"baseline.electricityKwhDay")};
  if(origin==="provided"&&productionKeys.every(key=>baseline[key]===null))issues.push({field:"baseline",message:"Provide at least one production baseline; missing outputs stay unavailable"});
  const minimumOutputs=Object.fromEntries(productionKeys.map(key=>[key,numeric(floors[key],`minimumOutputs.${key}`)])) as Production;
  const constraints:HrtStudyConstraints={maxHrtHours:numeric(limits.maxHrtHours,"maxHrtHours",true,.001),minSrtDays:numeric(limits.minSrtDays,"minSrtDays"),temperatureMinC:numeric(limits.temperatureMinC,"temperatureMinC",true,-273.15),temperatureMaxC:numeric(limits.temperatureMaxC,"temperatureMaxC",true,-273.15),phMin:numeric(limits.phMin,"phMin",true,0,14),phMax:numeric(limits.phMax,"phMax",true,0,14),olrMax:numeric(limits.olrMax,"olrMax"),olrBasis:limits.olrBasis==null?null:choice(limits.olrBasis,["COD","VS"] as const,"olrBasis")};
  if(constraints.temperatureMinC!==null&&constraints.temperatureMaxC!==null&&constraints.temperatureMinC>constraints.temperatureMaxC)issues.push({field:"temperature",message:"Minimum cannot exceed maximum"});
  if(constraints.phMin!==null&&constraints.phMax!==null&&constraints.phMin>constraints.phMax)issues.push({field:"pH",message:"Minimum cannot exceed maximum"});
  if(constraints.olrMax!==null&&constraints.olrBasis===null)issues.push({field:"olrBasis",message:"Choose COD or VS for the loading constraint"});
  for(const key of productionKeys)if(baseline[key]!==null&&baseline[key]!>0&&baseline[key]!<1e-6)issues.push({field:`baseline.${key}`,message:"Use zero or a value of at least 0.000001 in the stated units"});
  if(baseline.methaneM3Day!==null&&baseline.biogasM3Day!==null&&baseline.methaneM3Day>baseline.biogasM3Day)issues.push({field:"baseline.methaneM3Day",message:"Methane volume cannot exceed total biogas volume"});
  // User measurements remain independent; do not force a fixed electrical efficiency onto them.
  if(issues.length)throw new InputError(issues);
  return {mode,technology,feed,baseline,minimumOutputs,constraints};
}

export function calculateHrtStudy(raw:unknown){
  const request=resolveHrtStudyRequest(raw),baseline=request.baseline,c=request.constraints;
  const floors=Object.fromEntries(productionKeys.map(key=>[key,request.minimumOutputs[key]??baseline[key]])) as Production;
  const candidates:HrtStudyCandidate[]=sourceScenarios.map(source=>{
    const reasons:string[]=[];
    if(request.mode==="technology"&&source.pathway!==request.technology)reasons.push("Different reactor technology");
    if(request.feed==="solids"&&["H1","H2","H3"].includes(source.pathway))reasons.push("Hourly high-rate pathway is not supported here for untreated solid-rich feed");
    if(source.hrtHours>=baseline.hrtHours)reasons.push("Does not reduce baseline HRT");
    if(c.maxHrtHours!==null&&source.hrtHours>c.maxHrtHours)reasons.push("Above requested HRT maximum");
    if(c.minSrtDays!==null&&source.srtDays<c.minSrtDays)reasons.push("Below requested SRT minimum");
    if(c.temperatureMinC!==null&&source.temperatureC<c.temperatureMinC||c.temperatureMaxC!==null&&source.temperatureC>c.temperatureMaxC)reasons.push("Outside requested temperature range");
    if(c.phMin!==null&&source.ph<c.phMin||c.phMax!==null&&source.ph>c.phMax)reasons.push("Outside requested pH range");
    if(c.olrMax!==null){
      if(source.olrBasis!==c.olrBasis)reasons.push(source.olrBasis==="UNRESOLVED_COD_VS"?"Source COD/VS loading unit conflict is unresolved":"Loading basis does not match");
      else if(source.olr>c.olrMax)reasons.push("Above requested organic loading maximum");
    }
    for(const key of productionKeys)if(floors[key]!==null&&source.outputs[key]<floors[key]!)reasons.push(`Below ${key} production minimum`);
    const gains=Object.fromEntries(productionKeys.map(key=>[key,baseline[key]===null||baseline[key]===0?null:(source.outputs[key]/baseline[key]!-1)*100])) as Production;
    const known=productionKeys.map(key=>gains[key]).filter((v):v is number=>v!==null);
    return {...source,eligible:!reasons.length,reasons,gains,minimumGainPct:known.length?Math.min(...known):null,
      timeSavedHours:baseline.hrtHours-source.hrtHours,hrtReductionPct:(baseline.hrtHours-source.hrtHours)/baseline.hrtHours*100};
  }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||a.hrtHours-b.hrtHours||(b.minimumGainPct??-Infinity)-(a.minimumGainPct??-Infinity)||a.id.localeCompare(b.id));
  const selected=candidates.find(row=>row.eligible)??null;
  const warnings=["Planning simulation, not plant measurements or validated operating limits. No equipment is controlled.",
    "Gross electricity excludes heating, pretreatment, pumping and membrane loads. Net energy benefit is unavailable.",
    "The model assessment did not qualify generated predictions. This run ranks the 200 original source scenarios."];
  if(baseline.origin==="workbook")warnings.push("The workbook baseline is a conventional 15-day CSTR. Comparison with another pathway assumes the corresponding reactor or pretreatment upgrade; it is not a setpoint-only improvement.");
  if(request.feed==="unknown")warnings.push("Feed compatibility is unknown. A technology ranking does not establish plant suitability.");
  else warnings.push("Feed filtering follows broad workbook categories; feed-specific validation and calibrated uncertainty are unavailable.");
  if(candidates.some(row=>row.eligible&&row.olrBasis==="UNRESOLVED_COD_VS"))warnings.push("CSTR loading values have conflicting COD/VS units in the source. They are displayed as unresolved and cannot satisfy an OLR constraint.");
  if(productionKeys.some(key=>baseline[key]===null))warnings.push("Missing baseline outputs have no percentage comparison; only available baselines or explicit production floors are enforced.");
  if(productionKeys.some(key=>baseline[key]===0))warnings.push("A zero production baseline has no defined percentage gain.");
  const annual=(point:Production)=>Object.fromEntries(productionKeys.map(key=>[key,point[key]===null?null:point[key]!*365])) as Production;
  return {version:manifest.version,dataHash:hrtStudyDataHash,method:"SOURCE_SCENARIO_RANKING" as const,
    status:selected?"QUALIFIED" as const:"NO_QUALIFYING_CANDIDATE" as const,request,baseline,floors,
    selected,candidates,candidateCount:candidates.length,eligibleCount:candidates.filter(row=>row.eligible).length,
    generatedCandidateCount:0,modelPredictionEnabled:false,source:manifest.primarySource,
    annual:{baseline:annual(baseline),selected:selected?annual(selected.outputs):null},
    hrtChangeHours:selected?selected.hrtHours-baseline.hrtHours:null,warnings};
}
export type HrtStudyCalculation=ReturnType<typeof calculateHrtStudy>;
export const hrtStudyOutputHash=(calculation:HrtStudyCalculation)=>fingerprint({version:calculation.version,dataHash:calculation.dataHash,request:calculation.request,status:calculation.status,baseline:calculation.baseline,floors:calculation.floors,selected:calculation.selected,candidates:calculation.candidates,annual:calculation.annual,hrtChangeHours:calculation.hrtChangeHours});
