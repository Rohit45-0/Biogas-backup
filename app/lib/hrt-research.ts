import modelFile from "../../ai-workflow/research/hours-model.json";
import dataFile from "../../ai-workflow/research/hours-data.json";
import {InputError} from "./inputs";
import {fingerprint} from "./evidence";
import {hrtChange} from "./hrt";
import researchBuild from "./research-build.json";
import {improvesProduction,chooseProductionCandidate,differentDisplayedProduction} from "./research-candidate-selection";
import {chooseWorkbookCandidate,chooseEnergyCandidate,type WorkbookBaseline} from "./workbook-comparison";
import {pairedModel,pairedModelHash,pairedPoolHash,pairedInputs,evaluatePairedScenarios,selectPairedScenario,type PairedComparison,type PairedCandidateEvidence,type PairedEvaluation} from "./paired-scenarios";

import {sameTankModel,sameTankInputs,sameTankIdentity,sameTankPoolHash,sameTankSource,chooseSameTank} from "./same-tank-model";

export type ResearchRequest={baseline:{value:number;unit:"days"|"hours"};objective:"shortest_hrt"|"maximum_energy"|"target_hrt"|"workbook_gain"|"paired_gain"|"same_tank_gain";sameTankStage?:string;retainedMethanePct:number;targetHours:number;selectionSeed?:string;previousCandidateId?:string;previousSelectedHrtHours?:number;previousEnergySelectedHrtHours?:number;scenario?:{mode:"automatic";seed?:string;previousHrtHours?:number}};
export type ResearchPoint={hrtHours:number;biogasM3Day:number;methanePct:number;methaneM3Day:number;electricityKwhDay:number;feedRate:number|null;temperature:number|null;ph:number|null;olr:number|null;h2sBeforePpm:number|null;h2sAfterPpm:number|null;stabilityPct:number|null;paired?:PairedCandidateEvidence};
export type ResearchSource={file:string;sheet:string;sha256:string};
type ResearchModel={version:string;input:{min:number;max:number;offset:number;scale:number};basis:{kind:"polynomial"|"linear_spline";degree?:number;knots?:number[]};outputKeys:string[];coefficients:Record<string,number[]>;source:ResearchSource;fitRows:number;evaluation:{displaySummary?:{method:string;trainRows:number;testRows:number;metricScope:string;targets:{key:string;unit:string;mae:number;rmse:number;r2:number|null;baselineMae:number}[];improvementPct:number|null};[key:string]:unknown};limitations:string[]};
export type ResearchRow=Omit<ResearchPoint,"methaneM3Day"|"electricityKwhDay">&{id:string;sourceRow:number;baselineBiogasM3Day:number};
export const researchModel=modelFile as unknown as ResearchModel;
export const researchRows=(dataFile as unknown as {rows:ResearchRow[]}).rows;
export const researchArtifactHash=fingerprint(modelFile);
export const researchDataHash=fingerprint(dataFile);
export const researchManifestHash=fingerprint({artifactHash:researchArtifactHash,dataHash:researchDataHash,sourceHash:researchBuild.sourceHash});
export const researchDefaults:ResearchRequest={baseline:{value:24,unit:"hours"},objective:"shortest_hrt",retainedMethanePct:90,targetHours:12};
export const researchDisclosure="Synthetic workbook research scenario. Hours-scale operation and plant improvement have not been demonstrated. No equipment is controlled.";

export function resolveResearchRequest(value:unknown):ResearchRequest{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new InputError([{field:"request",message:"A complete research request is required"}]);
  const body=value as Record<string,unknown>,issues:{field:string;message:string}[]=[];
  for(const key of Object.keys(body))if(!["baseline","objective","retainedMethanePct","targetHours","scenario","previousSelectedHrtHours","previousEnergySelectedHrtHours","selectionSeed","previousCandidateId","sameTankStage"].includes(key))issues.push({field:key,message:"Unknown research parameter"});
  const baseline=body.baseline&&typeof body.baseline==="object"&&!Array.isArray(body.baseline)?body.baseline as Record<string,unknown>:{};
  for(const key of Object.keys(baseline))if(!["value","unit"].includes(key))issues.push({field:`baseline.${key}`,message:"Unknown baseline parameter"});
  if(!["days","hours"].includes(String(baseline.unit)))issues.push({field:"baseline.unit",message:"Choose days or hours"});
  const beforeHours=typeof baseline.value==="number"?baseline.value*(baseline.unit==="days"?24:1):NaN;
  if(!Number.isFinite(beforeHours)||beforeHours<=0||beforeHours>2160)issues.push({field:"baseline.value",message:"Enter a positive comparison time no greater than 90 days / 2,160 hours"});
  if(!["shortest_hrt","maximum_energy","target_hrt","workbook_gain","paired_gain","same_tank_gain"].includes(String(body.objective)))issues.push({field:"objective",message:"Select a supported research objective"});
  if(["paired_gain","same_tank_gain"].includes(String(body.objective))&&body.scenario!==undefined)issues.push({field:"scenario",message:"Paired comparisons select from the supported 2,000 input vectors"});
  if(body.selectionSeed!==undefined&&(!["paired_gain","same_tank_gain"].includes(String(body.objective))||typeof body.selectionSeed!=="string"||!/^[a-zA-Z0-9-]{8,64}$/.test(body.selectionSeed)))issues.push({field:"selectionSeed",message:"Paired replay seed must contain 8–64 letters, numbers or hyphens"});
  if(body.previousCandidateId!==undefined&&(!["paired_gain","same_tank_gain"].includes(String(body.objective))||typeof body.previousCandidateId!=="string"||!(body.objective==="same_tank_gain"?sameTankInputs:pairedInputs).some(input=>input.id===body.previousCandidateId)))issues.push({field:"previousCandidateId",message:"Previous candidate must belong to the paired input pool"});
  if(body.objective==="workbook_gain"&&body.scenario!==undefined)issues.push({field:"scenario",message:"Workbook comparison uses the supplied fixed biogas baseline"});
  if(typeof body.retainedMethanePct!=="number"||!Number.isFinite(body.retainedMethanePct)||body.retainedMethanePct<1||body.retainedMethanePct>100)issues.push({field:"retainedMethanePct",message:"Enter a methane-retention goal from 1 to 100 percent"});
  if(typeof body.targetHours!=="number"||!Number.isFinite(body.targetHours)||body.targetHours<researchModel.input.min||body.targetHours>researchModel.input.max)issues.push({field:"targetHours",message:`Target HRT must be within the source trajectory: ${researchModel.input.min}–${researchModel.input.max} hours`});
  if(body.previousSelectedHrtHours!==undefined&&(typeof body.previousSelectedHrtHours!=="number"||!Number.isFinite(body.previousSelectedHrtHours)||body.previousSelectedHrtHours<researchModel.input.min||body.previousSelectedHrtHours>researchModel.input.max))issues.push({field:"previousSelectedHrtHours",message:"Previous selection must be within 2–24 hours"});
  if(body.previousEnergySelectedHrtHours!==undefined&&(typeof body.previousEnergySelectedHrtHours!=="number"||!Number.isFinite(body.previousEnergySelectedHrtHours)||body.previousEnergySelectedHrtHours<researchModel.input.min||body.previousEnergySelectedHrtHours>researchModel.input.max))issues.push({field:"previousEnergySelectedHrtHours",message:"Previous energy selection must be within 2–24 hours"});
  let scenario:ResearchRequest["scenario"];
  if(body.scenario!==undefined){
    const raw=body.scenario&&typeof body.scenario==="object"&&!Array.isArray(body.scenario)?body.scenario as Record<string,unknown>:{};
    for(const key of Object.keys(raw))if(!["mode","seed","previousHrtHours"].includes(key))issues.push({field:`scenario.${key}`,message:"Unknown scenario parameter"});
    if(raw.mode!=="automatic")issues.push({field:"scenario.mode",message:"Use automatic scenario generation or omit scenario for a manual study"});
    if(raw.seed!==undefined&&(typeof raw.seed!=="string"||!/^[a-zA-Z0-9-]{8,64}$/.test(raw.seed)))issues.push({field:"scenario.seed",message:"A replay seed must contain 8–64 letters, numbers or hyphens"});
    if(raw.previousHrtHours!==undefined&&(typeof raw.previousHrtHours!=="number"||!Number.isFinite(raw.previousHrtHours)||raw.previousHrtHours<researchModel.input.min||raw.previousHrtHours>researchModel.input.max))issues.push({field:"scenario.previousHrtHours",message:"Previous scenario HRT must be within 2–24 hours"});
    scenario={mode:"automatic",...(raw.seed!==undefined?{seed:raw.seed as string}:{}),...(raw.previousHrtHours!==undefined?{previousHrtHours:raw.previousHrtHours as number}:{})};
  }
  if(body.sameTankStage!==undefined&&(body.objective!=="same_tank_gain"||!sameTankModel.stages.includes(String(body.sameTankStage))))issues.push({field:"sameTankStage",message:"Choose a supported same-tank stage"});
  if(issues.length)throw new InputError(issues);
  return {...(body.objective==="same_tank_gain"?{sameTankStage:String(body.sameTankStage??"R5")}:{}),baseline:{value:baseline.value as number,unit:baseline.unit as "days"|"hours"},objective:body.objective as ResearchRequest["objective"],retainedMethanePct:body.retainedMethanePct as number,targetHours:body.targetHours as number,...(scenario?{scenario}:{}),...(body.previousSelectedHrtHours!==undefined?{previousSelectedHrtHours:body.previousSelectedHrtHours as number}:{}),...(body.previousEnergySelectedHrtHours!==undefined?{previousEnergySelectedHrtHours:body.previousEnergySelectedHrtHours as number}:{}),...(body.selectionSeed!==undefined?{selectionSeed:body.selectionSeed as string}:{}),...(body.previousCandidateId!==undefined?{previousCandidateId:body.previousCandidateId as string}:{})};
}

function scenarioInput(request:ResearchRequest){
  if(request.objective==="workbook_gain")return {mode:"workbook" as const,hrtHours:null,seed:null,previousHrtHours:null,minimumChangeHours:0};
  const baselineHours=request.baseline.value*(request.baseline.unit==="days"?24:1);
  if(!request.scenario)return {mode:"manual" as const,hrtHours:baselineHours,seed:null,previousHrtHours:null,minimumChangeHours:0};
  const {seed,previousHrtHours}=request.scenario;
  if(!seed)throw new InputError([{field:"scenario.seed",message:"Automatic calculations require a saved scenario seed"}]);
  const previous=previousHrtHours??(baselineHours>=researchModel.input.min&&baselineHours<=researchModel.input.max?baselineHours:null);
  // Vary the model input, never its predictions. A saved seed reproduces the exact scenario.
  const first=Math.ceil(researchModel.input.min*10),last=Math.floor(researchModel.input.max*10);
  const hours=Array.from({length:last-first+1},(_,i)=>(first+i)/10).filter(h=>previous===null||Math.abs(h-previous)>=1-1e-10);
  const sample=parseInt(fingerprint({generator:"hours-scenario-v1",seed}).slice(7,15),16)/0x100000000;
  return {mode:"automatic" as const,hrtHours:hours[Math.floor(sample*hours.length)],seed,previousHrtHours:previous,minimumChangeHours:1};
}

export function predictResearch(hrtHours:number):ResearchPoint{
  const {min,max,offset,scale}=researchModel.input;
  if(!Number.isFinite(hrtHours)||hrtHours<min||hrtHours>max)throw new Error("HRT outside research model coverage");
  const x=(hrtHours-offset)/scale;
  const features=researchModel.basis.kind==="polynomial"
    ?Array.from({length:(researchModel.basis.degree??1)+1},(_,i)=>x**i)
    :[1,x,...(researchModel.basis.knots??[]).map(k=>Math.max(0,x-k))];
  const values:Record<string,number>={};
  for(const key of researchModel.outputKeys){
    const weights=researchModel.coefficients[key];
    if(!weights||weights.length!==features.length||weights.some(v=>!Number.isFinite(v)))throw new Error("Invalid research model coefficients");
    values[key]=features.reduce((sum,value,i)=>sum+value*weights[i],0);
  }
  if(!Object.values(values).every(Number.isFinite)||values.biogasM3Day<0||values.methanePct<0||values.methanePct>100)throw new Error("Research model returned unsupported outputs");
  const methaneM3Day=values.biogasM3Day*values.methanePct/100;
  return {...values,hrtHours,methaneM3Day,electricityKwhDay:methaneM3Day*9.97*.36} as ResearchPoint;
}

function calculateLegacyResearch(body:unknown){
  const request=resolveResearchRequest(body),{min,max}=researchModel.input,scenario=scenarioInput(request);
  const candidates=Array.from({length:2000},(_,i)=>predictResearch(min+(max-min)*i/1999));
  const peak=candidates.reduce((best,p)=>p.methaneM3Day>best.methaneM3Day?p:best);
  const minimumMethane=peak.methaneM3Day*request.retainedMethanePct/100;
  const feasible=candidates.filter(p=>p.methaneM3Day+1e-10>=minimumMethane);
  const beforeHours=scenario.hrtHours;
  const workbook=request.objective==="workbook_gain";
  const sourceBaselines=[...new Set(researchRows.map(row=>row.baselineBiogasM3Day))];
  if(workbook&&(sourceBaselines.length!==1||!Number.isFinite(sourceBaselines[0])||sourceBaselines[0]<=0))throw new Error("The workbook does not contain one consistent positive biogas baseline");
  const workbookChoice=workbook?chooseWorkbookCandidate(candidates,sourceBaselines[0],request.previousSelectedHrtHours):null;
  const comparison=beforeHours!==null&&beforeHours>=min&&beforeHours<=max?predictResearch(beforeHours):null;
  const improvesBoth=(point:ResearchPoint)=>!comparison||improvesProduction(point,comparison);
  const jointCandidates=workbookChoice?workbookChoice.eligible:comparison?feasible.filter(improvesBoth):feasible;
  const previousSelection=request.previousSelectedHrtHours===undefined?null:predictResearch(request.previousSelectedHrtHours);
  const choice=request.objective==="target_hrt"||workbook?null:chooseProductionCandidate(jointCandidates,request.objective as "shortest_hrt"|"maximum_energy",previousSelection);
  const target=request.objective==="target_hrt"?predictResearch(request.targetHours):null;
  const eligibleTarget=target&&(!comparison||target.methaneM3Day+1e-10>=minimumMethane&&improvesBoth(target))?target:null;
  const recommended=workbookChoice?.selected??(request.objective==="target_hrt"?eligibleTarget:choice?.selected??null);
  const selected=recommended??comparison;
  if(!selected)throw new Error("No feasible research point found");
  const workbookBaseline:WorkbookBaseline|null=workbookChoice?{biogasM3Day:sourceBaselines[0],methaneM3Day:null,electricityKwhDay:null,hrtHours:null,minimumGainPct:50,selectedGainPct:(selected.biogasM3Day/sourceBaselines[0]-1)*100,qualifyingCount:workbookChoice.eligible.length,source:"Supplied hours workbook: Baseline Biogas (m³/d)"}:null;
  const candidateSelection={strategy:workbook?"WORKBOOK_BIOGAS_50PCT_CYCLE":request.objective==="target_hrt"?"EXACT_REQUESTED_HRT":"OBJECTIVE_RANKED_DISTINCT_PRODUCTION",
    previousSelectedHrtHours:previousSelection?.hrtHours??null,eligibleCount:jointCandidates.length,
    alternativeCount:workbookChoice?Math.max(0,workbookChoice.eligible.length-1):choice?.alternativeCount??(eligibleTarget?1:0),
    ...(workbookChoice?{cycleIndex:workbookChoice.index,cycleStride:workbookChoice.stride}:{}),
    changedFromPrevious:previousSelection?differentDisplayedProduction(selected,previousSelection):null,
    reason:workbook?"Cycle through model scenarios meeting the 50% biogas gain goal against the workbook baseline. This selects the biogas study. Methane and electricity have their own energy-focused study against the 2-hour model baseline. The cycle repeats after every qualifying scenario has been visited.":request.objective==="target_hrt"?"The entered target is kept exact; it is not changed to create variation.":previousSelection&&choice?.alternativeCount===0?"No visibly different eligible candidate is available; the best eligible result or current scenario is retained.":"Rank the candidates that improve all required outputs, preferring a different displayed production result when available."};
  const jointImprovement={
    status:workbook?"WORKBOOK_BIOGAS_IMPROVED":comparison?(recommended?"IMPROVED":"NO_JOINT_IMPROVEMENT"):"COMPARISON_UNAVAILABLE",
    candidateCount:workbook||comparison?jointCandidates.length:0,
    minimumAnnualGain:1,
    reason:(comparison&&!recommended?(request.objective==="target_hrt"?"The requested HRT does not improve both biogas and methane while meeting the methane-retention goal.":"No evaluated HRT improves both biogas and methane while meeting the methane-retention goal."):null) as string|null,
  } as const;
  const retentionTime={beforeHours,optimizedHours:selected.hrtHours,...(beforeHours===null?{changeHours:null,direction:"unavailable"}:hrtChange(beforeHours,selected.hrtHours)),changePct:beforeHours===null?null:(selected.hrtHours/beforeHours-1)*100};
  const recommendationFields=[
    {key:"hrtHours",label:"HRT",unit:"hours"},
    {key:"temperature",label:"Temperature",unit:"°C"},
    {key:"ph",label:"pH",unit:"pH"},
    {key:"feedRate",label:"Feed rate",unit:"kg VS/day"},
    {key:"olr",label:"Organic loading",unit:"kg VS/m³/day"},
  ] as const;
  const recommendations=recommendationFields.map(field=>{
    const current=field.key==="hrtHours"?beforeHours:comparison?.[field.key]??null,target=selected[field.key];
    return {...field,current,target,change:current===null||target===null?null:target-current};
  });
  const energyBaseline=workbook?predictResearch(2):null;
  const energyChoice=energyBaseline?chooseEnergyCandidate(candidates,energyBaseline,request.previousEnergySelectedHrtHours):null;
  const energyComparison=energyBaseline&&energyChoice?{
    basis:"MODELLED_2H_ENERGY_STUDY" as const,baseline:energyBaseline,selected:energyChoice.selected,
    minimumGainPct:50,qualifyingCount:energyChoice.eligible.length,
    methaneGainPct:(energyChoice.selected.methaneM3Day/energyBaseline.methaneM3Day-1)*100,
    electricityGainPct:(energyChoice.selected.electricityKwhDay/energyBaseline.electricityKwhDay-1)*100,
    biogasChangePct:(energyChoice.selected.biogasM3Day/energyBaseline.biogasM3Day-1)*100,
    selection:{strategy:"ENERGY_RANKED_50PCT_CYCLE",cycleIndex:energyChoice.index,cycleStride:energyChoice.stride,previousSelectedHrtHours:request.previousEnergySelectedHrtHours??null},
    retentionTime:{beforeHours:energyBaseline.hrtHours,optimizedHours:energyChoice.selected.hrtHours,...hrtChange(energyBaseline.hrtHours,energyChoice.selected.hrtHours)},
    recommendations:recommendationFields.map(field=>({ ...field,current:energyBaseline[field.key],target:energyChoice.selected[field.key],change:energyChoice.selected[field.key]===null||energyBaseline[field.key]===null?null:energyChoice.selected[field.key]!-energyBaseline[field.key]!})),
    candidatePreview:[energyChoice.selected,...energyChoice.eligible.filter(point=>point.hrtHours!==energyChoice.selected.hrtHours)].slice(0,8),
    meaning:"Independent energy study: both baseline and selection are fitted-model predictions. This selection increases methane and electricity while reducing biogas versus its own 2-hour baseline. The workbook biogas study uses a different baseline and selected operating point."
  }:null;
  const goal={kind:workbook?"workbook_biogas_gain":"methane_retention",retainedMethanePct:request.retainedMethanePct,peakMethaneM3Day:peak.methaneM3Day,minimumMethaneM3Day:minimumMethane,selectedRetainedPct:selected.methaneM3Day/peak.methaneM3Day*100,satisfied:workbookBaseline?workbookBaseline.selectedGainPct>=50:selected.methaneM3Day+1e-10>=minimumMethane,feasibleCount:workbookChoice?.eligible.length??feasible.length};
  const ranked=[...(recommended?jointCandidates:comparison?[]:candidates)].sort(request.objective==="maximum_energy"?(a,b)=>b.electricityKwhDay-a.electricityKwhDay:(a,b)=>Math.abs(a.hrtHours-selected.hrtHours)-Math.abs(b.hrtHours-selected.hrtHours));
  const preview=recommended?[selected,...ranked.filter(point=>point.hrtHours!==selected.hrtHours)]:ranked;
  const curve=Array.from({length:45},(_,i)=>predictResearch(min+(max-min)*i/44));
  return {request,scenario,retentionTime,comparison,workbookBaseline,energyComparison,recommendations,selected,jointImprovement,candidateSelection,goal,peak,curve,candidatePreview:preview.slice(0,8),candidates,candidateCount:candidates.length,
    modelVersion:researchModel.version,artifactHash:researchArtifactHash,dataHash:researchDataHash,manifestHash:researchManifestHash,engineHash:researchBuild.sourceHash,source:researchModel.source,
    mode:"HOURS_RESEARCH" as "HOURS_RESEARCH"|"PAIRED_RESEARCH"|"SAME_TANK_RESEARCH",validationStatus:"SYNTHETIC AGREEMENT ONLY" as "SYNTHETIC AGREEMENT ONLY"|"EXPLORATORY · WEAK HOLDOUT PERFORMANCE"|"PLANNING SIMULATION · PLANT VALIDATION PENDING",disclosure:researchDisclosure,
    baselineMeaning:workbook?"Biogas baseline is supplied by the hours workbook. The workbook supplies no methane, electricity or HRT baseline. A separate energy study uses the model at 2 hours and its own selected operating point. These are synthetic comparisons, not measured plant improvements.":scenario.mode==="automatic"?"Automatically generated HRT input evaluated by the fitted hours-scale model. This is a synthetic scenario, not a plant measurement.":comparison?"Entered comparison HRT evaluated by the same hours-scale model; both scenarios are estimates, not measured plant results.":"User-entered comparison time outside the hours-scale model. No baseline production or measured before/after plant pair is implied.",
    trajectoryMeaning:"HRT selects a jointly varying synthetic process trajectory. These data do not identify independent effects of temperature, pH, feed rate or loading.",
    uncertainty:{status:"NOT_CALIBRATED",predictionInterval:null},
    candidateMeaning:"2,000 model evaluations, not 2,000 independent training records.",
    energyAssumptions:{methaneKwhPerM3:9.97,electricalEfficiency:.36,source:"Original workbook Assumptions & Audit; theoretical electricity potential"}};
}
type LegacyCalculation=ReturnType<typeof calculateLegacyResearch>;
export function researchIdentity(paired=false,sameTank=false){if(sameTank)return sameTankIdentity;return paired?{artifactHash:fingerprint({after:pairedModelHash,baseline:researchArtifactHash}),dataHash:fingerprint({pool:pairedPoolHash,baseline:researchDataHash,source:pairedModel.source.sha256})}:{artifactHash:researchArtifactHash,dataHash:researchDataHash};}

export function calculateResearch(body:unknown):LegacyCalculation&{pairedComparison:PairedComparison|null}{
  const request=resolveResearchRequest(body);
  if(request.objective==="same_tank_gain")return calculateSameTankResearch(request);
  if(request.objective!=="paired_gain")return {...calculateLegacyResearch(request),pairedComparison:null};
  if(!request.selectionSeed)throw new InputError([{field:"selectionSeed",message:"Paired calculations require a saved selection seed"}]);
  const evaluations=evaluatePairedScenarios(predictResearch),choice=selectPairedScenario(evaluations,request.selectionSeed,request.previousCandidateId);
  const asPoint=(row:PairedEvaluation):ResearchPoint=>({hrtHours:row.input.hrtHours,temperature:row.input.temperature,ph:row.input.ph,feedRate:row.input.feedRate,olr:row.input.olr,...row.prediction,h2sBeforePpm:null,h2sAfterPpm:null,stabilityPct:null,paired:{input:row.input,baseline:row.baseline,gains:row.gains,minimumGainPct:row.minimumGainPct}});
  const selected=asPoint(choice.selected),candidates=evaluations.map(asPoint),comparison=predictResearch(selected.hrtHours);
  const peak=candidates.reduce((best,point)=>point.methaneM3Day>best.methaneM3Day?point:best);
  const thresholdMet=choice.selected.minimumGainPct>40;
  const pairedComparison:PairedComparison={basis:"EXPLORATORY_CROSS_MODEL_SAME_HRT",input:choice.selected.input,gains:choice.selected.gains,minimumGainPct:choice.selected.minimumGainPct,thresholdPct:40,thresholdMet,qualifyingCount:choice.qualifying.length,evaluatedCount:2000,trainingRows:200,selectionSeed:request.selectionSeed,previousCandidateId:request.previousCandidateId??null,poolHash:pairedPoolHash,baselineModelVersion:researchModel.version,baselineSourceHash:researchModel.source.sha256,validation:pairedModel.holdout,meaning:"Exploratory comparison: the existing HRT-only model supplies the baseline at this input's HRT. The 200-row Ridge model predicts the selected pathway and operating inputs. The baseline does not independently respond to temperature, pH, feed or loading. Cross-model differences are not measured treatment effects."};
  return {
    request,pairedComparison,scenario:{mode:"manual",hrtHours:selected.hrtHours,seed:null,previousHrtHours:null,minimumChangeHours:0},
    retentionTime:{beforeHours:selected.hrtHours,optimizedHours:selected.hrtHours,...hrtChange(selected.hrtHours,selected.hrtHours),changePct:0},comparison,selected,workbookBaseline:null,energyComparison:null,
    recommendations:([
      {key:"hrtHours",label:"HRT",unit:"hours"},{key:"temperature",label:"Temperature",unit:"°C"},{key:"ph",label:"pH",unit:"pH"},{key:"feedRate",label:"Feed rate",unit:"kg VS/day"},{key:"olr",label:"Organic loading",unit:"kg VS/m³/day"},
    ] as const).map(field=>({...field,current:field.key==="hrtHours"?selected.hrtHours:null,target:selected[field.key],change:field.key==="hrtHours"?0:null})),
    jointImprovement:{status:choice.selected.minimumGainPct>0?"IMPROVED":"COMPARISON_UNAVAILABLE",candidateCount:choice.qualifying.length,minimumAnnualGain:1,reason:thresholdMet?null:"No candidate exceeds 40% in all three outputs. The best evaluated comparison is shown without adding a gain."},
    candidateSelection:{strategy:"RANDOM_INPUT_ABOVE_40PCT_ALL_OUTPUTS",previousSelectedHrtHours:null,eligibleCount:choice.qualifying.length,alternativeCount:choice.alternativeCount,changedFromPrevious:request.previousCandidateId?selected.paired!.input.id!==request.previousCandidateId:null,reason:"Evaluate all 2,000 inputs with the fitted model. Prefer candidates exceeding 40% in each output; randomly select a different visible input comparison when available. Replay the saved seed to reproduce the run."},
    goal:{kind:"paired_all_outputs_gain",retainedMethanePct:request.retainedMethanePct,peakMethaneM3Day:peak.methaneM3Day,minimumMethaneM3Day:comparison.methaneM3Day*1.4,selectedRetainedPct:selected.methaneM3Day/peak.methaneM3Day*100,satisfied:thresholdMet,feasibleCount:choice.qualifying.length},
    peak,curve:[],candidatePreview:[selected,...choice.ranked.filter(row=>row.input.id!==choice.selected.input.id).slice(0,7).map(asPoint)],candidates,candidateCount:candidates.length,
    modelVersion:pairedModel.version,...researchIdentity(true),manifestHash:researchManifestHash,engineHash:researchBuild.sourceHash,source:pairedModel.source,
    mode:"PAIRED_RESEARCH",validationStatus:"EXPLORATORY · WEAK HOLDOUT PERFORMANCE",disclosure:"Planning simulation workbook, not measured plant data. Held-out accuracy has not exceeded the mean benchmark. No equipment is controlled.",
    baselineMeaning:pairedComparison.meaning,trajectoryMeaning:"One pathway and five numeric inputs per candidate. There is no single HRT curve for this multivariate comparison.",uncertainty:{status:"NOT_CALIBRATED",predictionInterval:null},candidateMeaning:"200 training rows; 2,000 source and same-pathway interpolated input vectors evaluated on every run. Random selection changes inputs, not model coefficients or predicted gains.",energyAssumptions:{methaneKwhPerM3:9.97,electricalEfficiency:.36,source:"Source workbook assumptions; gross electricity potential, excluding pretreatment energy costs"},
  };
}

function calculateSameTankResearch(request:ResearchRequest):LegacyCalculation&{pairedComparison:PairedComparison|null}{
  if(!request.selectionSeed)throw new InputError([{field:"selectionSeed",message:"Same-tank calculations require a saved selection seed"}]);
  const stageId=request.sameTankStage??"R5",stage=sameTankModel.stageInfo.find(item=>item.id===stageId)!;
  const choice=chooseSameTank(request.selectionSeed,stageId,request.previousCandidateId);
  const asPoint=(row:typeof choice.selected):ResearchPoint=>({hrtHours:row.input.hrtHours,temperature:row.input.temperature,ph:row.input.ph,feedRate:null,olr:null,...row.prediction,h2sBeforePpm:null,h2sAfterPpm:null,stabilityPct:null,paired:{input:row.input,baseline:row.baseline,baselineHrtHours:row.baseline.hrtHours,gains:row.gains,minimumGainPct:row.minimumGainPct}});
  const selected=asPoint(choice.selected),candidates=choice.evaluations.map(asPoint);
  const comparison:ResearchPoint={...choice.selected.baseline,temperature:null,ph:null,feedRate:null,olr:null,h2sBeforePpm:null,h2sAfterPpm:null,stabilityPct:null};
  const sourceRow=sameTankSource.rows[choice.selected.input.parentA-1];
  const thresholdMet=choice.selected.minimumGainPct>40;
  const pairedComparison:PairedComparison={basis:"SOURCE_BEFORE_SAME_TANK_MODEL_AFTER",input:choice.selected.input,gains:choice.selected.gains,minimumGainPct:choice.selected.minimumGainPct,thresholdPct:40,thresholdMet,qualifyingCount:choice.qualifying.length,evaluatedCount:2000,trainingRows:500,selectionSeed:request.selectionSeed,previousCandidateId:request.previousCandidateId??null,poolHash:sameTankPoolHash,baselineModelVersion:"original-source-before",baselineSourceHash:sameTankModel.source.sha256,validation:sameTankModel.holdout,meaning:"The supplied same-tank BEFORE values are compared with a fitted-model AFTER prediction for the selected retrofit stage. All BEFORE values are constant in this file. This planning comparison includes the stated hardware and feed changes; it is not a measured AI-only treatment effect.",sameTank:{stage:stageId,stageLabel:stage.label,added:stage.added,feedRequirements:stage.feedRequirements,sourceVerdicts:stage.sourceVerdicts,baselineHrtHours:comparison.hrtHours,baselineSourceRow:choice.selected.input.parentA+1,sourceAfterHrtHours:sourceRow["AFTER HRT (h)"],sourceAfter:{biogasM3Day:sourceRow["AFTER Biogas (m3/d)"],methaneM3Day:sourceRow["AFTER Methane (m3/d)"],electricityKwhDay:sourceRow["AFTER Electricity (kWh/d)"]},sourceFile:sameTankModel.source.file,sourceSheet:sameTankModel.source.sheet,sourceHash:sameTankModel.source.sha256,coverageMin:stage.min[0],coverageMax:stage.max[0]}};
  const peak=candidates.reduce((best,p)=>p.methaneM3Day>best.methaneM3Day?p:best);
  return {request,pairedComparison,scenario:{mode:"manual",hrtHours:comparison.hrtHours,seed:null,previousHrtHours:null,minimumChangeHours:0},comparison,selected,workbookBaseline:null,energyComparison:null,
    retentionTime:{beforeHours:comparison.hrtHours,optimizedHours:selected.hrtHours,...hrtChange(comparison.hrtHours,selected.hrtHours),changePct:(selected.hrtHours/comparison.hrtHours-1)*100},
    recommendations:([{key:"hrtHours",label:"HRT",unit:"hours"},{key:"temperature",label:"Temperature",unit:"°C"},{key:"ph",label:"pH",unit:"pH"}] as const).map(field=>({ ...field,current:comparison[field.key],target:selected[field.key],change:comparison[field.key]===null?null:selected[field.key]!-comparison[field.key]!})),
    jointImprovement:{status:choice.selected.minimumGainPct>0?"IMPROVED":"COMPARISON_UNAVAILABLE",candidateCount:choice.qualifying.length,minimumAnnualGain:1,reason:thresholdMet?null:"No candidate in this stage exceeds 40% in all outputs; the best actual model comparison is shown."},
    candidateSelection:{strategy:"SAME_TANK_STAGE_40PCT_SEEDED_SELECTION",previousSelectedHrtHours:null,eligibleCount:choice.qualifying.length,alternativeCount:choice.alternativeCount,changedFromPrevious:request.previousCandidateId?selected.paired!.input.id!==request.previousCandidateId:null,reason:"Evaluate 2,000 generated inputs with the trained model; select within the requested stage, prioritizing shorter HRT and more than 40% gain in every output. Preserve the replay seed and source parent rows."},
    goal:{kind:"same_tank_all_outputs_gain",retainedMethanePct:request.retainedMethanePct,peakMethaneM3Day:peak.methaneM3Day,minimumMethaneM3Day:comparison.methaneM3Day*1.4,selectedRetainedPct:selected.methaneM3Day/peak.methaneM3Day*100,satisfied:thresholdMet,feasibleCount:choice.qualifying.length},
    peak,curve:[],candidatePreview:[selected,...choice.ranked.filter(p=>p.input.id!==choice.selected.input.id).slice(0,7).map(asPoint)],candidates,candidateCount:2000,
    modelVersion:sameTankModel.version,...sameTankIdentity,manifestHash:researchManifestHash,engineHash:researchBuild.sourceHash,source:sameTankModel.source,mode:"SAME_TANK_RESEARCH",validationStatus:"PLANNING SIMULATION · PLANT VALIDATION PENDING",disclosure:"500 planning simulation records; 2,000 generated model evaluations. The selected stage requires the stated feed and retrofit conditions. No plant performance is demonstrated and no equipment is controlled.",baselineMeaning:pairedComparison.meaning,trajectoryMeaning:"Saved model evaluations within one retrofit stage. A before-to-after connector is a comparison, not a fitted causal HRT curve.",uncertainty:{status:"NOT_CALIBRATED",predictionInterval:null},candidateMeaning:"500 training records; 2,000 same-stage interpolated input vectors evaluated by the fitted model. Generated inputs are not additional training measurements.",energyAssumptions:{methaneKwhPerM3:9.97,electricalEfficiency:.36,source:"Gross electrical potential; pretreatment and retrofit energy costs unavailable. Source BEFORE values preserve original rounding."}};
}

export type ResearchCalculation=ReturnType<typeof calculateResearch>;
export function researchOutputHash(result:ResearchCalculation){return fingerprint({request:result.request,scenario:result.scenario,selected:result.selected,retentionTime:result.retentionTime,comparison:result.comparison,...(result.pairedComparison?{pairedComparison:result.pairedComparison}:{}),...(result.workbookBaseline?{workbookBaseline:result.workbookBaseline}:{}),...(result.energyComparison?{energyComparison:result.energyComparison}:{}),recommendations:result.recommendations,jointImprovement:result.jointImprovement,candidateSelection:result.candidateSelection,goal:result.goal,curve:result.curve,candidates:result.candidates,artifactHash:result.artifactHash,dataHash:result.dataHash,manifestHash:result.manifestHash});}

export function researchMetadata(){return {sameTank:{...sameTankModel,candidateCount:2000,inputCoverage:{min:Math.min(...sameTankModel.stageInfo.map(s=>s.min[0])),max:Math.max(...sameTankModel.stageInfo.map(s=>s.max[0]))}},paired:{version:pairedModel.version,source:pairedModel.source,trainingRows:200,candidateCount:2000,modelDescription:pairedModel.learner,holdout:pairedModel.holdout,developmentRows:pairedModel.developmentRows,testRows:pairedModel.testRows,limitations:pairedModel.limitations,inputCoverage:{min:Math.min(...pairedInputs.map(input=>input.hrtHours)),max:Math.max(...pairedInputs.map(input=>input.hrtHours))}},name:"Hours-scale trajectory model",modelDescription:String(researchModel.evaluation.selectedCandidate??researchModel.basis.kind),version:researchModel.version,artifactHash:researchArtifactHash,dataHash:researchDataHash,manifestHash:researchManifestHash,
  input:researchModel.input,fitRows:researchModel.fitRows,source:researchModel.source,defaults:researchDefaults,
  scenarioGeneration:{mode:"automatic",input:"HRT in hours",stepHours:.1,minimumChangeHours:1,meaning:"Each click generates a new synthetic input. Predictions use the fitted model; the same optimization goal can select the same recommendation."},
  evaluation:researchModel.evaluation,limitations:researchModel.limitations,disclosure:researchDisclosure,
  outputs:[{key:"biogasM3Day",label:"Biogas",unit:"m³/day"},{key:"methaneM3Day",label:"Methane output",unit:"m³ CH₄/day"},{key:"electricityKwhDay",label:"Electricity potential",unit:"kWh/day"},{key:"hrtHours",label:"Retention time",unit:"hours"}],
  assumptions:{methaneKwhPerM3:9.97,electricalEfficiency:.36,plantValidated:false,independentProcessEffects:false,uncertaintyCalibrated:false}};}
