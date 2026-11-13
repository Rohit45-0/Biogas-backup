// Read-only audit of source extraction, fitted predictions and optimization outcomes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const root=path.resolve(__dirname,'..');
const {calculateResearch,predictResearch,researchDefaults,researchModel,researchRows}=require('../app/lib/hrt-research.ts');
const {researchResultIsConsistent}=require('../app/lib/research-result-integrity.ts');
const out=path.join(root,'test-results/calculation-audit');
fs.mkdirSync(out,{recursive:true});
const source=JSON.parse(fs.readFileSync(path.join(out,'original-workbooks.json'),'utf8'));
const inventory=JSON.parse(fs.readFileSync(path.join(root,'ai-workflow/research/source-inventory.json'),'utf8'));
const hashes=source.map(book=>({file:book.file,hashMatches:inventory.files.find(item=>item.file===book.file)?.sha256===book.sha256,sheets:book.sheets.map(s=>({name:s.name,rows:s.row_count}))}));
assert.ok(hashes.every(item=>item.hashMatches),'Original workbook hashes must match the model study');
const book=source.find(b=>b.file===researchModel.source.file);
const sheet=book.sheets.find(s=>s.name==='Hours-Scale AI Synthetic 500');
const start=sheet.rows.findIndex(r=>r[0]==='Run ID'),columns=sheet.rows[start];
const raw=sheet.rows.slice(start+1).filter(r=>r[0]);
assert.equal(raw.length,500);assert.equal(researchRows.length,500);
const mapping={id:['Run ID',1],hrtHours:['HRT (hours)',1],baselineBiogasM3Day:['Baseline Biogas (m³/d)',1],biogasM3Day:['Optimized Biogas (m³/d)',1],methanePct:['CH₄ Content (%)',100],feedRate:['Feed Rate (kg VS/d)',1],temperature:['Temperature (°C)',1],ph:['pH',1],olr:['OLR (kg VS/m³·d)',1],h2sBeforePpm:['H₂S Before Filter (ppm)',1],h2sAfterPpm:['H₂S After Filter (ppm)',1],stabilityPct:['Process Stability (%)',100]};
for(let i=0;i<500;i++)for(const [key,[label,factor]] of Object.entries(mapping)){const v=raw[i][columns.indexOf(label)];assert.equal(researchRows[i][key],typeof v==='number'?v*factor:v,`source row ${i+1} ${key}`);}
const pointSummary=p=>({hrtHours:p.hrtHours,biogasM3Day:p.biogasM3Day,methanePct:p.methanePct,methaneM3Day:p.methaneM3Day,electricityKwhDay:p.electricityKwhDay});
const outcomes=[];
for(let n=20;n<=240;n++){
 const run=calculateResearch({...researchDefaults,baseline:{value:n/10,unit:'hours'}});
 assert.ok(researchResultIsConsistent(run));
 for(const p of [run.comparison,run.selected,...run.candidates]){
  assert.ok(Math.abs(p.methaneM3Day-p.biogasM3Day*p.methanePct/100)<1e-10);
  assert.ok(Math.abs(p.electricityKwhDay-p.methaneM3Day*9.97*.36)<1e-10);
 }
 for(const key of ['biogasM3Day','methaneM3Day','electricityKwhDay'])for(const p of [run.comparison,run.selected])assert.ok(Math.abs([31,28,31,30,31,30,31,31,30,31,30,31].reduce((sum,d)=>sum+d*p[key],0)-365*p[key])<1e-7);
 outcomes.push({currentHrt:n/10,status:run.jointImprovement.status,selectedHrt:run.selected.hrtHours,eligible:run.jointImprovement.candidateCount,current:pointSummary(run.comparison),selected:pointSummary(run.selected)});
}
const parity=JSON.parse(fs.readFileSync(path.join(root,'ai-workflow/research/hours-parity.json'),'utf8'));
for(const row of parity.cases){const predicted=predictResearch(row.hrtHours);for(const [key,expected] of Object.entries(row.expected))assert.ok(Math.abs(predicted[key]-expected)<parity.tolerance,`Python/TypeScript parity ${row.hrtHours} ${key}`);}
const sourceCalculationResiduals={methaneM3Day:0,electricityKwhDay:0};
for(const row of raw){
 const value=label=>row[columns.indexOf(label)];
 const methane=value('Optimized Biogas (m³/d)')*value('CH₄ Content (%)');
 sourceCalculationResiduals.methaneM3Day=Math.max(sourceCalculationResiduals.methaneM3Day,Math.abs(methane-value('Methane Output (m³ CH₄/d)')));
 sourceCalculationResiduals.electricityKwhDay=Math.max(sourceCalculationResiduals.electricityKwhDay,Math.abs(value('Methane Output (m³ CH₄/d)')*9.97*.36-value('Electricity Potential (kWh/d)')));
}
const result={originalFiles:hashes,sourceRowsChecked:500,sourceColumns:columns,workbookBaselineBiogas:[...new Set(researchRows.map(r=>r.baselineBiogasM3Day))],sourceHasBaselineMethane:columns.some(c=>/baseline.*(methane|ch₄)|before.*ch₄/i.test(c)),sourceHasBaselineElectricity:columns.some(c=>/baseline.*electricity/i.test(c)),sweep:{total:outcomes.length,improved:outcomes.filter(r=>r.status==='IMPROVED').length,improvedHrtInputs:outcomes.filter(r=>r.status==='IMPROVED').map(r=>r.currentHrt)},screenshotCases:outcomes.filter(r=>[5.4,16.5,17.9,14.8,20.6,24,2].includes(r.currentHrt)),twoHour:pointSummary(predictResearch(2)),parityKeys:Object.keys(parity),monthlyAnnualReconciliation:'PASS',energyFormulaChecks:'PASS',outcomes};
result.pythonParityCases=parity.cases.length;
result.sourceCalculationResiduals=sourceCalculationResiduals;
fs.writeFileSync(path.join(out,'calculation-audit.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,outcomes:undefined,originalFiles:hashes.map(b=>({file:b.file,hashMatches:b.hashMatches})),sourceColumns:undefined},null,2));
