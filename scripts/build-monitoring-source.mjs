import {readFile,writeFile} from 'node:fs/promises';
const source=JSON.parse(await readFile('data/early-warning/source.json','utf8'));
// An explicit prefix of the supplied sensor workbook, not repeated or invented rows.
// Hidden truth and future-failure labels never enter the monitoring source.
const rows=source.rows.slice(0,400).map(r=>({
 t:r.Timestamp,feed:r.Feed_m3h,codIn:r.COD_In_mgL,codOut:r.COD_Out_mgL,
 ph:r.pH,temp:r.Temp_C,pressure:r.Gas_Pressure_mbar,h2s:r.H2S_Gas_Outlet_ppm,
 o2:r.O2_Gas_pct,volts:r.Voltage_V,gas:r.Biogas_Flow_Nm3h,ch4:r.CH4_pct,kw:r.Generator_kW,
 gasEstimate:r.Generator_kW/(r.CH4_pct/100*9.97*.32),
 codRemoval:(r.COD_In_mgL-r.COD_Out_mgL)/r.COD_In_mgL*100,
}));
if(rows.length!==400||new Set(rows.map(r=>r.t)).size!==400)throw new Error('Expected 400 distinct supplied hours');
const thresholds=[['gasLow','gas','low',2.6,2.2],['ch4Low','ch4','low',60,58],['codRemovalLow','codRemoval','low',62,58],['phLow','ph','low',6.9,6.7],['phHigh','ph','high',7.6,7.8],['tempLow','temp','low',35.5,35],['tempHigh','temp','high',38,39],['h2sHigh','h2s','high',180,250],['o2High','o2','high',.7,1],['pressureHigh','pressure','high',18,22],['kwLow','kw','low',4.7,4.3],['voltsLow','volts','low',390,380],['voltsHigh','volts','high',415,425]];
const expectedCrossings=Object.fromEntries(thresholds.map(([id,key,side,w,c])=>[id,{warning:rows.filter(r=>side==='low'?r[key]<=w&&r[key]>c:r[key]>=w&&r[key]<c).length,critical:rows.filter(r=>side==='low'?r[key]<=c:r[key]>=c).length}]));
const result={metadata:{version:'monitoring-sensor-400-2026-11-10-v2',sourceFile:source.metadata.file,workbookSha256:source.metadata.sha256,sourceTotalRows:480,selectedRows:400,selection:'First 400 hourly records, original order; hours 1–400',provenance:source.metadata.provenance,sourceTimezone:source.metadata.sourceTimezone,derivedFields:{gasEstimate:'Electrical-equivalent gas flow: generator kW / (CH4 fraction × 9.97 × 0.32), Nm³/h; not a measurement',codRemoval:'100 × (COD inlet − COD outlet) / COD inlet'},expectedCrossings},rows};
await writeFile('data/demo-monitoring/sensor-400.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({rows:rows.length,first:rows[0].t,last:rows.at(-1).t,expectedCrossings}));
