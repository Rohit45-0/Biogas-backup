type Output={biogasM3Day:number;methaneM3Day:number;electricityKwhDay:number};

export function researchImprovement(current:{[K in keyof Output]:number|null}|null,selected:Output){
  return ([
    {key:"biogasM3Day",label:"Biogas",unit:"m³/year"},
    {key:"methaneM3Day",label:"Methane",unit:"m³ CH₄/year"},
    {key:"electricityKwhDay",label:"Electricity",unit:"kWh/year"},
  ] as const).map(metric=>{
    const baseline=current?.[metric.key]??null;
    const change=baseline===null?null:selected[metric.key]-baseline;
    return {...metric,change,annualChange:change===null?null:change*365,
      percent:change===null||baseline===null||baseline===0?null:change/baseline*100};
  });
}

// Small, real gains must not round to 0%, and a missing comparison is not zero.
export function improvementPercent(value:number|null){
  if(value===null)return "Not comparable";
  if(value===0)return "0%";
  if(Math.abs(value)<.01)return value>0?"+<0.01%":"−<0.01%";
  return `${value>0?"+":""}${value.toLocaleString(undefined,{maximumFractionDigits:2})}%`;
}
