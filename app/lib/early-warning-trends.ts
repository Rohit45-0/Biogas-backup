// A separately versioned engineering candidate, never substituted for the
// archived workbook score. Only current/past sensor values enter inference.
export const trendPolicy={version:"causal-trend-advisory-2026-11-13-v1",historyHours:6,horizonHours:12,minimumFitR2:0.6,persistenceSamples:2,status:"EXPERIMENTAL_ADVISORY",uncertainty:"NOT_CALIBRATED"};
type Sample={Timestamp:string;pH:number;Temp_C:number;CH4_pct:number;H2S_Gas_Outlet_ppm:number;Biogas_Flow_Nm3h:number;Generator_kW:number};
type Rule={name:string;warning:number;side:string};
const channels=[
  {key:"pH",rule:"pH low",minSlope:0.005},
  {key:"Temp_C",rule:"Temperature low",minSlope:0.03},
  {key:"CH4_pct",rule:"Methane low",minSlope:0.08},
  {key:"H2S_Gas_Outlet_ppm",rule:"H2S outlet high",minSlope:2},
  {key:"Biogas_Flow_Nm3h",rule:"Gas flow low",minSlope:0.02},
  {key:"Generator_kW",rule:"Electric power low",minSlope:0.025},
] as const;
function time(row:Sample){return Date.parse(row.Timestamp.replace(" ","T")+":00Z");}
function forecasts(rows:readonly Sample[],index:number,rules:readonly Rule[]) {
  if(index<6)return [];
  const window=rows.slice(index-6,index+1),current=rows[index];
  if(window.length!==7||window.some((r,i)=>!Number.isFinite(time(r))||(i>0&&time(r)-time(window[i-1])!==3600000)))return [];
  return channels.flatMap(channel=>{
    const rule=rules.find(r=>r.name===channel.rule);if(!rule)return [];
    const y=window.map(r=>r[channel.key]);if(!y.every(Number.isFinite))return [];
    const mean=y.reduce((a,b)=>a+b,0)/7,slope=y.reduce((sum,v,i)=>sum+(i-3)*(v-mean),0)/28;
    const total=y.reduce((sum,v)=>sum+(v-mean)**2,0),error=y.reduce((sum,v,i)=>sum+(v-(mean+slope*(i-3)))**2,0),r2=total>0?1-error/total:0;
    const low=rule.side==="LOW",value=current[channel.key];
    if((low?value<=rule.warning:value>=rule.warning)||(low?slope>=-channel.minSlope:slope<=channel.minSlope)||r2<trendPolicy.minimumFitR2)return [];
    const hours=(rule.warning-value)/slope;
    if(hours<=0||hours>trendPolicy.horizonHours)return [];
    return [{channel:channel.key,rule:rule.name,value,warningLimit:rule.warning,slopePerHour:slope,fitR2:r2,estimatedHoursToLimit:hours}];
  });
}
export function evaluateTrendAdvisory(rows:readonly Sample[],index:number,rules:readonly Rule[]) {
  const now=forecasts(rows,index,rules),previous=forecasts(rows,index-1,rules);
  const reasons=now.filter(n=>previous.some(p=>p.channel===n.channel));
  return {policy:trendPolicy,status:index<7?"WARMUP":reasons.length?"PREDICTIVE_ADVISORY":"NO_TREND_ADVISORY",triggered:reasons.length>0,reasons,
    inputWindow:{from:Math.max(0,index-7),to:index},usesFutureLabels:false,usesLaboratoryValues:false,
    interpretation:"Persistent linear sensor trends project a reference warning-limit crossing within 12 hours. This is an engineering advisory, not a trained failure classifier or a calibrated probability. Fixed alarms remain independent."};
}
