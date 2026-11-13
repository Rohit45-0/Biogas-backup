import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const source=await readFile(new URL("../app/lib/early-warning-trends.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {evaluateTrendAdvisory}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const rules=[{name:"Temperature low",warning:35.5,side:"LOW"}];
const make=()=>Array.from({length:25},(_,i)=>({Timestamp:"2026-01-01 "+String(i%24).padStart(2,"0")+":00",pH:7.2,Temp_C:37.5-i*.12,CH4_pct:65,H2S_Gas_Outlet_ppm:50,Biogas_Flow_Nm3h:3.2,Generator_kW:6}));
test("persistent causal trend warns before reference threshold without future rows",()=>{
 const rows=make(),r=evaluateTrendAdvisory(rows,8,rules);
 assert.equal(r.triggered,true);assert.ok(r.reasons[0].value>35.5);assert.ok(r.reasons[0].estimatedHoursToLimit<=12);
 const changed=structuredClone(rows);for(let i=9;i<changed.length;i++)changed[i].Temp_C=999;
 assert.deepEqual(evaluateTrendAdvisory(changed,8,rules),r);
 assert.deepEqual(evaluateTrendAdvisory(rows.slice(0,9),8,rules),r);
});
test("warmup, timestamp gaps and an isolated jump cannot claim a persistent forecast",()=>{
 const rows=make();assert.equal(evaluateTrendAdvisory(rows,5,rules).status,"WARMUP");
 rows[5].Timestamp="2026-01-01 03:00";assert.equal(evaluateTrendAdvisory(rows,8,rules).triggered,false);
 const flat=make().map(r=>({...r,Temp_C:37}));flat[8].Temp_C=36;
 assert.equal(evaluateTrendAdvisory(flat,8,rules).triggered,false);
});
test("a crossed fixed threshold is not misrepresented as a pre-threshold forecast",()=>{
 const rows=make();assert.equal(evaluateTrendAdvisory(rows,18,rules).triggered,false);
});
