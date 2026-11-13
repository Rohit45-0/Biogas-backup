type ProductionPoint={hrtHours:number;biogasM3Day:number;methanePct:number;methaneM3Day:number;electricityKwhDay:number};
import type {WorkbookBaseline} from "./workbook-comparison";
import type {PairedComparison} from "./paired-scenarios";
type ProductionComparison={comparison:ProductionPoint|null;selected:ProductionPoint;pairedComparison?:PairedComparison|null;jointImprovement?:{status:string}|null;workbookBaseline?:WorkbookBaseline|null;energyComparison?:{basis:string;baseline:ProductionPoint;selected:ProductionPoint;minimumGainPct:number;methaneGainPct:number;electricityGainPct:number;biogasChangePct:number}|null};

/** Prevent legacy or corrupted runs from being presented as an optimization. */
export function researchResultIsConsistent(result:ProductionComparison){
  const {comparison,selected,jointImprovement}=result;
  const energyMatches=(point:ProductionPoint)=>Number.isFinite(point.biogasM3Day)&&Number.isFinite(point.methaneM3Day)&&Number.isFinite(point.electricityKwhDay)&&
    Math.abs(point.methaneM3Day-point.biogasM3Day*point.methanePct/100)<1e-7&&
    Math.abs(point.electricityKwhDay-point.methaneM3Day*9.97*.36)<1e-7;
  if(!energyMatches(selected))return false;
  if(result.pairedComparison?.sameTank){
    const pair=result.pairedComparison,study=pair.sameTank!,keys=["biogasM3Day","methaneM3Day","electricityKwhDay"] as const;
    if(!comparison||result.workbookBaseline||result.energyComparison||pair.basis!=="SOURCE_BEFORE_SAME_TANK_MODEL_AFTER"||pair.trainingRows!==500||pair.evaluatedCount!==2000||pair.thresholdPct!==40)return false;
    if(comparison.hrtHours!==study.baselineHrtHours||selected.hrtHours!==pair.input.hrtHours||selected.hrtHours>=comparison.hrtHours||selected.hrtHours<study.coverageMin||selected.hrtHours>study.coverageMax||study.stage!==pair.input.pathway)return false;
    // Source BEFORE values retain their original two-decimal rounding.
    if(Math.abs(comparison.methaneM3Day-comparison.biogasM3Day*comparison.methanePct/100)>.02||Math.abs(comparison.electricityKwhDay-comparison.methaneM3Day*9.97*.36)>.05)return false;
    if(keys.some(key=>!Number.isFinite(comparison[key])||comparison[key]<=0||!Number.isFinite(pair.gains[key])||Math.abs(pair.gains[key]-(selected[key]/comparison[key]-1)*100)>1e-8))return false;
    return Math.abs(pair.minimumGainPct-Math.min(...keys.map(key=>pair.gains[key])))<1e-8&&pair.thresholdMet===(pair.minimumGainPct>40)&&pair.qualifyingCount>=0&&pair.qualifyingCount<=2000&&(!pair.thresholdMet||pair.qualifyingCount>0)&&jointImprovement?.status===(pair.minimumGainPct>0?"IMPROVED":"COMPARISON_UNAVAILABLE");
  }
  if(comparison&&!energyMatches(comparison))return false;
  if(result.pairedComparison){
    const pair=result.pairedComparison,keys=["biogasM3Day","methaneM3Day","electricityKwhDay"] as const;
    if(!comparison||result.workbookBaseline||result.energyComparison||pair.basis!=="EXPLORATORY_CROSS_MODEL_SAME_HRT"||selected.hrtHours!==comparison.hrtHours||selected.hrtHours!==pair.input.hrtHours||pair.evaluatedCount!==2000||pair.trainingRows!==200||pair.thresholdPct!==40)return false;
    if(keys.some(key=>comparison[key]<=0||!Number.isFinite(pair.gains[key])||Math.abs(pair.gains[key]-(selected[key]/comparison[key]-1)*100)>1e-8))return false;
    return Math.abs(pair.minimumGainPct-Math.min(...keys.map(key=>pair.gains[key])))<1e-8&&pair.thresholdMet===(pair.minimumGainPct>40)&&pair.qualifyingCount>=0&&pair.qualifyingCount<=2000&&(!pair.thresholdMet||pair.qualifyingCount>0)&&jointImprovement?.status===(pair.minimumGainPct>0?"IMPROVED":"COMPARISON_UNAVAILABLE");
  }
  if(result.energyComparison){
    const e=result.energyComparison;
    if(!result.workbookBaseline||e.basis!=="MODELLED_2H_ENERGY_STUDY"||e.baseline.hrtHours!==2||e.minimumGainPct!==50||!energyMatches(e.baseline)||!energyMatches(e.selected)||e.selected.hrtHours<2||e.selected.hrtHours>24||e.selected.methaneM3Day<e.baseline.methaneM3Day*1.5||e.selected.electricityKwhDay<e.baseline.electricityKwhDay*1.5)return false;
    for(const [key,gain] of [["methaneM3Day",e.methaneGainPct],["electricityKwhDay",e.electricityGainPct],["biogasM3Day",e.biogasChangePct]] as const)if(!Number.isFinite(gain)||Math.abs(gain-(e.selected[key]/e.baseline[key]-1)*100)>1e-8)return false;
  }
  if(result.workbookBaseline){
    const baseline=result.workbookBaseline;
    return comparison===null&&jointImprovement?.status==="WORKBOOK_BIOGAS_IMPROVED"&&
      baseline.methaneM3Day===null&&baseline.electricityKwhDay===null&&baseline.hrtHours===null&&
      Number.isFinite(baseline.biogasM3Day)&&baseline.biogasM3Day>0&&baseline.minimumGainPct===50&&
      selected.biogasM3Day>=baseline.biogasM3Day*1.5&&
      Math.abs(baseline.selectedGainPct-(selected.biogasM3Day/baseline.biogasM3Day-1)*100)<1e-8;
  }
  if(!comparison)return jointImprovement?.status==="COMPARISON_UNAVAILABLE";
  if(jointImprovement?.status==="NO_JOINT_IMPROVEMENT")return selected.hrtHours===comparison.hrtHours&&
    selected.biogasM3Day===comparison.biogasM3Day&&selected.methaneM3Day===comparison.methaneM3Day&&selected.electricityKwhDay===comparison.electricityKwhDay;
  if(jointImprovement?.status!=="IMPROVED")return false;
  return Math.round(selected.biogasM3Day*365)>Math.round(comparison.biogasM3Day*365)&&
    Math.round(selected.methaneM3Day*365)>Math.round(comparison.methaneM3Day*365)&&
    Math.round(selected.electricityKwhDay*365)>Math.round(comparison.electricityKwhDay*365);
}
