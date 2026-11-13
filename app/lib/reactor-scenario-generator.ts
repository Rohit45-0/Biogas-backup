import sourceRows from "../../ai-workflow/research/reactor-study-2026-11-09/scenarios.json";
import artifact from "../../ai-workflow/research/reactor-study-2026-11-09/model.json";
import {fingerprint} from "./evidence";
import {InputError} from "./inputs";
import {predictReactorScenario,type ReactorRequest,type ReactorScenario} from "./reactor-optimization";

export const reactorGeneration={version:"same-reactor-neighbour-interpolation-v1",candidateCount:2000,neighbours:5,minWeight:.02,maxWeight:.98,scope:"EXPLORATORY_WITHIN_REACTOR_INTERPOLATION"} as const;
export const reactorInputFields=["hrtHours","srtDays","temperatureC","ph","upflowMHour","olr"] as const;
export type GeneratedReactorInput=Pick<ReactorScenario,"pathway"|"technology"|"configuration"|"olrBasis"|typeof reactorInputFields[number]>&{id:string;provenance:{kind:"generated";parentAId:string;parentBId:string;weightB:number}};
const byId=new Map(sourceRows.map(row=>[row.id,row]));
export const reactorInputKey=(row:Pick<GeneratedReactorInput,"pathway"|"configuration"|typeof reactorInputFields[number]>)=>JSON.stringify([row.pathway,row.configuration,...reactorInputFields.map(key=>row[key])]);
const sourceKeys=new Set(sourceRows.map(reactorInputKey));

// Distances use fitted feature scales. Neighbours always share technology and configuration.
const neighbours=new Map(sourceRows.map(a=>{
 const model=artifact.models[a.pathway as keyof typeof artifact.models];
 const ranked=sourceRows.filter(b=>b.id!==a.id&&b.pathway===a.pathway&&b.configuration===a.configuration&&reactorInputKey(b)!==reactorInputKey(a)).map(b=>({b,d:model.features.reduce((sum,key,index)=>sum+((b[key as typeof reactorInputFields[number]]-a[key as typeof reactorInputFields[number]])/model.fit.scale[index])**2,0)})).sort((a,b)=>a.d-b.d||a.b.id.localeCompare(b.b.id)).slice(0,reactorGeneration.neighbours).map(pair=>pair.b);
 return [a.id,ranked] as const;
}));

export function generateReactorInputs(request:Pick<ReactorRequest,"mode"|"technology">,seed:string):GeneratedReactorInput[]{
 if(!/^[a-zA-Z0-9-]{8,96}$/.test(seed))throw new InputError([{field:"generationSeed",message:"Use 8–96 letters, digits or hyphens for a replay seed"}]);
 const pathways=request.mode!=="upgrade"?[request.technology]:[...new Set(sourceRows.map(row=>row.pathway))].sort();
 const groups=pathways.map(pathway=>sourceRows.filter(row=>row.pathway===pathway&&(neighbours.get(row.id)?.length??0)>0));
 if(groups.some(rows=>!rows.length))throw new InputError([{field:"technology",message:"This reactor needs at least two distinct source input combinations to generate candidates"}]);
 let counter=0;
 const random=()=>parseInt(fingerprint({generator:reactorGeneration.version,seed,counter:counter++}).slice(7,20),16)/0x10000000000000;
 const generated:GeneratedReactorInput[]=[],unique=new Set<string>(),seedTag=fingerprint({seed}).slice(7,15);
 let attempts=0;
 while(generated.length<reactorGeneration.candidateCount&&attempts++<reactorGeneration.candidateCount*100){
  const group=groups[generated.length%groups.length],a=group[Math.floor(random()*group.length)],near=neighbours.get(a.id)!,b=near[Math.floor(random()*near.length)];
  const weightB=reactorGeneration.minWeight+random()*(reactorGeneration.maxWeight-reactorGeneration.minWeight);
  const numbers=Object.fromEntries(reactorInputFields.map(key=>[key,a[key]+(b[key]-a[key])*weightB])) as Pick<GeneratedReactorInput,typeof reactorInputFields[number]>;
  const input:GeneratedReactorInput={id:`GEN-${a.pathway}-${seedTag}-${String(generated.length+1).padStart(4,"0")}`,pathway:a.pathway,technology:a.technology,configuration:a.configuration,olrBasis:a.olrBasis,...numbers,provenance:{kind:"generated",parentAId:a.id,parentBId:b.id,weightB}};
  const key=reactorInputKey(input);if(sourceKeys.has(key)||unique.has(key))continue;unique.add(key);generated.push(input);
 }
 if(generated.length!==reactorGeneration.candidateCount)throw new Error("Could not generate 2,000 distinct reactor inputs within source coverage");
 return generated;
}

export function predictGeneratedReactor(input:GeneratedReactorInput){
 const source=byId.get(input.provenance.parentAId);
 if(!source||source.pathway!==input.pathway||source.configuration!==input.configuration)throw new Error("Generated input lineage does not match its reactor");
 // Only input features are replaced. The fitted inference function reads no source output or scenario ID.
 return predictReactorScenario({...source,...input,provenance:source.provenance});
}

export function generatedInputIsTraceable(input:GeneratedReactorInput){
 const a=byId.get(input.provenance.parentAId),b=byId.get(input.provenance.parentBId),w=input.provenance.weightB;
 return Boolean(a&&b&&a.pathway===input.pathway&&b.pathway===input.pathway&&a.configuration===input.configuration&&b.configuration===input.configuration&&w>=reactorGeneration.minWeight&&w<=reactorGeneration.maxWeight&&reactorInputFields.every(key=>Number.isFinite(input[key])&&Math.abs(input[key]-(a[key]+(b[key]-a[key])*w))<1e-9)&&!sourceKeys.has(reactorInputKey(input)));
}
export const reactorSourceById=(id:string)=>byId.get(id);
