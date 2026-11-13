export type WorkbookBaseline = {
  biogasM3Day: number;
  methaneM3Day: null;
  electricityKwhDay: null;
  hrtHours: null;
  minimumGainPct: number;
  selectedGainPct: number;
  qualifyingCount: number;
  source: string;
};

type Output = {biogasM3Day:number;methaneM3Day:number;electricityKwhDay:number};
type Summary={comparison:Output|null;selected:Output;workbookBaseline?:WorkbookBaseline|null;energyComparison?:{baseline:Output;selected:Output}|null};
/** Per-metric report values from two distinct studies, never one combined operating point. */
export function productionBaseline(result:Omit<Summary,"selected">) {
  if(result.workbookBaseline&&result.energyComparison)return {...result.workbookBaseline,methaneM3Day:result.energyComparison.baseline.methaneM3Day,electricityKwhDay:result.energyComparison.baseline.electricityKwhDay};
  return result.workbookBaseline??result.comparison;
}
export function selectedProduction(result:Summary):Output {
  return {biogasM3Day:result.selected.biogasM3Day,methaneM3Day:result.energyComparison?.selected.methaneM3Day??result.selected.methaneM3Day,electricityKwhDay:result.energyComparison?.selected.electricityKwhDay??result.selected.electricityKwhDay};
}

export function chooseEnergyCandidate<T extends Output&{hrtHours:number}>(candidates:T[],baseline:T,previousHrt?:number){
  if(!Number.isFinite(baseline.methaneM3Day)||baseline.methaneM3Day<=0||!Number.isFinite(baseline.electricityKwhDay)||baseline.electricityKwhDay<=0)throw new Error("Energy model baseline is unavailable");
  const eligible=candidates.filter(point=>point.methaneM3Day>=baseline.methaneM3Day*1.5&&point.electricityKwhDay>=baseline.electricityKwhDay*1.5).sort((a,b)=>b.electricityKwhDay-a.electricityKwhDay||a.hrtHours-b.hrtHours);
  if(!eligible.length)throw new Error("No model scenario meets the 50% energy comparison goal");
  const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
  let stride=Math.max(1,Math.floor(eligible.length/7));while(gcd(stride,eligible.length)!==1)stride++;
  const previousIndex=previousHrt===undefined?-1:eligible.findIndex(point=>Math.abs(point.hrtHours-previousHrt)<1e-8);
  const index=previousIndex<0?0:(previousIndex+stride)%eligible.length;
  return {selected:eligible[index],eligible,index,stride};
}

/** Traverse every qualifying point once before repeating, with visible jumps between runs. */
export function chooseWorkbookCandidate<T extends {hrtHours:number;biogasM3Day:number}>(candidates:T[], baseline:number, previousHrt?:number) {
  if(!Number.isFinite(baseline)||baseline<=0)throw new Error("Workbook biogas baseline is unavailable");
  const eligible=candidates.filter(point=>point.biogasM3Day>=baseline*1.5).sort((a,b)=>a.hrtHours-b.hrtHours);
  if(!eligible.length)throw new Error("No model scenario meets the 50% workbook biogas goal");
  const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
  let stride=Math.max(1,Math.floor(eligible.length/7));
  while(gcd(stride,eligible.length)!==1)stride++;
  const previousIndex=previousHrt===undefined?-1:eligible.findIndex(point=>Math.abs(point.hrtHours-previousHrt)<1e-8);
  const index=previousIndex<0?eligible.reduce((best,point,i)=>point.biogasM3Day>eligible[best].biogasM3Day?i:best,0):(previousIndex+stride)%eligible.length;
  return {selected:eligible[index],eligible,index,stride};
}
