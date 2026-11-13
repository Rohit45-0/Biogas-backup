import {calculateResearch,resolveResearchRequest,researchIdentity,researchManifestHash,researchOutputHash,type ResearchCalculation} from "./hrt-research";
import {researchResultIsConsistent} from "./research-result-integrity";
import {getEvidence,storeEvidence,storageProvider,verifyEvidence} from "./audit";
import {fingerprint} from "./evidence";
import type {AquaSession} from "./auth";

export async function executeResearch(body:unknown,session:AquaSession){
  const started=performance.now(),runId=crypto.randomUUID(),createdAt=new Date().toISOString();
  const request=resolveResearchRequest(body);
  if(request.scenario&&!request.scenario.seed)request.scenario.seed=runId;
  if(["paired_gain","same_tank_gain"].includes(request.objective)&&!request.selectionSeed)request.selectionSeed=runId;
  const calculated=calculateResearch(request);
  if(!researchResultIsConsistent(calculated))throw new Error("Research comparison failed joint-improvement or energy reconciliation checks");
  const response={...calculated,runId,createdAt,outputHash:researchOutputHash(calculated),
    elapsedMs:Number((performance.now()-started).toFixed(3)),
    trace:calculated.pairedComparison?.sameTank?["Read the 500 source records and named BEFORE/AFTER columns","Validate the selected retrofit stage and source coverage","Prepare stage, HRT, temperature, pH and SRT model features","Read the original named BEFORE HRT and production columns","Load 2,000 generated same-stage candidate inputs with source parent lineage","Run the fitted model; select within the requested stage, prioritizing shorter HRT and >40% gains","Derive methane, electricity and signed KPI changes; reconcile charts and reports","Save source rows, stage requirements, model hashes, inputs and replay seed"]:calculated.pairedComparison?["Load 2,000 supported input vectors from the 200-row planning study","Evaluate the fitted Ridge model for pathway, HRT, temperature, pH, feed and loading","Calculate each candidate's baseline with the existing HRT-only model at the same HRT","Derive methane and electricity with the saved energy assumptions","Prioritize candidates exceeding 40% gain in all three outputs","Randomly select an eligible input using the saved replay seed","Reconcile cards, charts and report values from the same candidate","Fingerprint both models, the input pool, request and outputs"]:["Validate explicit units and research bounds",calculated.workbookBaseline?"Read the supplied workbook biogas baseline":calculated.scenario.mode==="automatic"?"Generate a new HRT input and preserve its replay seed":"Use the entered comparison HRT","Evaluate scenario production with the fitted synthetic model","Search 2,000 points against the requested goal",calculated.workbookBaseline?"Select independent biogas and energy scenarios, with their own baselines and production trade-offs":"Calculate comparison, recommendations, signed HRT change and energy potential","Fingerprint model, data, request and outputs"],
    deployment:process.env.VERCEL_DEPLOYMENT_ID??process.env.VERCEL_URL??"local-development"};
  try{
    const record=await storeEvidence({id:runId,createdAt,username:session.username,role:session.role,kind:"hrt_research",request:body,inputs:calculated.request,response,
      modelVersion:calculated.modelVersion,manifestHash:researchManifestHash,requestHash:fingerprint(body),inputsHash:fingerprint(calculated.request),responseHash:fingerprint(response),outputHash:response.outputHash});
    return {...response,audit:{saved:true,status:"RECORDED",provider:storageProvider(),recordHash:record.recordHash}};
  }catch{return {...response,audit:{saved:false,status:"NOT RECORDED",provider:storageProvider(),recordHash:null}};}
}
export type ResearchResult=Awaited<ReturnType<typeof executeResearch>>;

export async function verifyResearch(runId:string,session:AquaSession){
  const record=await getEvidence(runId);
  if(!record||record.kind!=="hrt_research")return {http:404,data:{error:"Hours-scale research run not found"}};
  const integrity=verifyEvidence(record);
  if(!integrity)return {http:409,data:{error:"Stored evidence integrity failed"}};
  const saved=record.response as ResearchCalculation&{outputHash:string};
  const identity=researchIdentity(Boolean(saved.pairedComparison),Boolean(saved.pairedComparison?.sameTank));
  if(saved.artifactHash!==identity.artifactHash||saved.dataHash!==identity.dataHash||saved.manifestHash!==researchManifestHash)return {http:409,data:{error:"This record uses a different research model, dataset or engine build. Preserve and download its original evidence."}};
  const replay=calculateResearch(record.inputs);
  const checks=[
    {name:"Stored record HMAC and SHA-256",passed:integrity},
    {name:"Current model and source dataset match",passed:saved.artifactHash===identity.artifactHash&&saved.dataHash===identity.dataHash},
    {name:"Stored output fingerprint",passed:researchOutputHash(saved)===record.outputHash&&saved.outputHash===record.outputHash},
    {name:"Deterministic backend replay",passed:researchOutputHash(replay)===saved.outputHash},
    {name:"Scenario input and explicit time units",passed:saved.retentionTime.beforeHours===replay.scenario.hrtHours&&saved.scenario.hrtHours===replay.scenario.hrtHours&&(!saved.request.scenario||saved.scenario.previousHrtHours===null||Math.abs(saved.scenario.hrtHours-saved.scenario.previousHrtHours)>=1-1e-10)},
    {name:"Stage / model HRT coverage",passed:saved.pairedComparison?.sameTank?saved.selected.hrtHours>=saved.pairedComparison.sameTank.coverageMin&&saved.selected.hrtHours<=saved.pairedComparison.sameTank.coverageMax:saved.selected.hrtHours>=2&&saved.selected.hrtHours<=24},
    {name:"Methane and electricity units",passed:[saved.selected,...(saved.energyComparison?[saved.energyComparison.baseline,saved.energyComparison.selected]:[])].every(point=>Math.abs(point.electricityKwhDay-point.methaneM3Day*9.97*.36)<1e-9&&Math.abs(point.methaneM3Day-point.biogasM3Day*point.methanePct/100)<1e-9)},
    {name:"Research status and comparison basis preserved",passed:saved.pairedComparison?.sameTank?saved.mode==="SAME_TANK_RESEARCH"&&saved.pairedComparison.basis==="SOURCE_BEFORE_SAME_TANK_MODEL_AFTER":saved.pairedComparison?saved.mode==="PAIRED_RESEARCH"&&saved.validationStatus==="EXPLORATORY · WEAK HOLDOUT PERFORMANCE"&&saved.pairedComparison.basis==="EXPLORATORY_CROSS_MODEL_SAME_HRT":saved.mode==="HOURS_RESEARCH"&&saved.validationStatus==="SYNTHETIC AGREEMENT ONLY"},
    {name:"Production comparison reconciles",passed:researchResultIsConsistent(saved)},
  ];
  const reportId=crypto.randomUUID(),createdAt=new Date().toISOString();
  const report={runId,reportId,createdAt,status:checks.every(c=>c.passed)?"PASS":"FAIL",checks,meaning:"Software integrity and replay only; not plant validation.",modelVersion:saved.modelVersion};
  try{
    await storeEvidence({id:reportId,createdAt,username:session.username,role:session.role,kind:"hrt_verification",request:{runId},inputs:record.inputs,response:report,
      modelVersion:saved.modelVersion,manifestHash:researchManifestHash,requestHash:fingerprint({runId}),inputsHash:fingerprint(record.inputs),responseHash:fingerprint(report),outputHash:fingerprint(checks)});
    return {http:200,data:{...report,saved:true}};
  }catch{return {http:200,data:{...report,saved:false}};}
}
