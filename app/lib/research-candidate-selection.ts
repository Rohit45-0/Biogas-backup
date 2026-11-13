export type ProductionCandidate={hrtHours:number;biogasM3Day:number;methaneM3Day:number;electricityKwhDay:number};

export function improvesProduction(candidate:ProductionCandidate,current:ProductionCandidate){
  // Preserve the one-unit annual minimum used by the report integrity checks.
  return (["biogasM3Day","methaneM3Day","electricityKwhDay"] as const)
    .every(key=>candidate[key]>current[key]+1/365);
}

export function differentDisplayedProduction(candidate:ProductionCandidate,previous:ProductionCandidate){
  return candidate.hrtHours.toFixed(2)!==previous.hrtHours.toFixed(2)&&
    candidate.biogasM3Day.toFixed(1)!==previous.biogasM3Day.toFixed(1)&&
    candidate.methaneM3Day.toFixed(1)!==previous.methaneM3Day.toFixed(1)&&
    candidate.electricityKwhDay.toFixed(2)!==previous.electricityKwhDay.toFixed(2);
}

export function chooseProductionCandidate<T extends ProductionCandidate>(eligible:T[],objective:"shortest_hrt"|"maximum_energy",previous:ProductionCandidate|null){
  const alternatives=previous?eligible.filter(point=>differentDisplayedProduction(point,previous)):eligible;
  const pool=alternatives.length?alternatives:eligible;
  const selected=pool.reduce<T|null>((best,point)=>!best||(objective==="maximum_energy"?point.electricityKwhDay>best.electricityKwhDay:point.hrtHours<best.hrtHours)?point:best,null);
  return {selected,eligibleCount:eligible.length,alternativeCount:alternatives.length,
    changed:previous&&selected?differentDisplayedProduction(selected,previous):null};
}
