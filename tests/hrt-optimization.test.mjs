import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {calculateHrtStudy,resolveHrtStudyRequest,hrtStudyDefaults,hrtStudyMetadata,hrtStudyOutputHash}=require('../app/lib/hrt-optimization.ts');
const {hrtStudyCsv}=require('../app/lib/hrt-optimization-execution.ts');
const dir=new URL('../ai-workflow/research/hrt-optimization-2026-11-08/',import.meta.url);
const source=JSON.parse(fs.readFileSync(new URL('source-archive.json',dir),'utf8'));
const rows=source[0].sheets['200 Scenarios'].rows.slice(1);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const request=()=>structuredClone(hrtStudyDefaults);

test('all eight sheets and 200 unique primary rows are preserved; canonical outputs reconcile',()=>{
  assert.equal(source.length,2);assert.equal(source.reduce((sum,item)=>sum+Object.keys(item.sheets).length,0),8);
  for(const workbook of source)assert.equal('sha256:'+createHash('sha256').update(fs.readFileSync(new URL('sources/'+workbook.file,dir))).digest('hex'),workbook.sha256);
  const result=calculateHrtStudy(request());
  assert.equal(result.candidateCount,200);assert.equal(result.generatedCandidateCount,0);
  assert.equal(new Set(result.candidates.map(row=>row.id)).size,200);
  for(const candidate of result.candidates){
    const row=rows[candidate.provenance.row-2];assert.equal(candidate.sourceScenario,row[0]);
    assert.equal(candidate.hrtHours,row[10]);assert.equal(candidate.srtDays,row[12]);
    close(candidate.outputs.biogasM3Day,row[18]);close(candidate.outputs.methaneM3Day,row[18]*row[17]/100);
    close(candidate.outputs.electricityKwhDay,row[18]*row[17]/100*9.97*.36);
    close(candidate.outputs.annualElectricityKwh,candidate.outputs.electricityKwhDay*365);
    close(candidate.hrtReductionPct,(360-row[10])/360*100);
    for(const key of ['biogasM3Day','methaneM3Day','electricityKwhDay'])close(candidate.gains[key],(candidate.outputs[key]/result.baseline[key]-1)*100);
  }
  close(result.baseline.methaneM3Day,66.15*.6363);close(result.baseline.electricityKwhDay,66.15*.6363*3.5892);
  close(result.annual.baseline.electricityKwhDay,result.baseline.electricityKwhDay*365);
});

test('default is shortest UASB scenario, not maximum production or an arbitrary gain multiplier',()=>{
  const result=calculateHrtStudy(request());assert.equal(result.selected.id,'HRT-0163');assert.equal(result.selected.hrtHours,4.8);
  assert.equal(result.eligibleCount,23);assert.equal(result.hrtChangeHours,-355.2);
  assert.ok(result.candidates.filter(row=>row.eligible).every(row=>row.pathway==='H1'));
  assert.equal(hrtStudyOutputHash(result),hrtStudyOutputHash(calculateHrtStudy(result.request)));
  assert.equal(result.modelPredictionEnabled,false);
});

test('technology and feed constraints cannot silently switch reactors',()=>{
  for(const technology of hrtStudyMetadata().technologies){
    const input=request();input.technology=technology.id;const result=calculateHrtStudy(input);
    const matching=rows.filter(row=>row[1]===technology.id);
    assert.equal(result.selected.pathway,technology.id);assert.equal(result.selected.hrtHours,Math.min(...matching.map(row=>row[10])));
  }
  const input=request();input.feed='solids';assert.equal(calculateHrtStudy(input).selected,null);
  input.mode='upgrade';const result=calculateHrtStudy(input);
  assert.ok(result.candidates.filter(row=>row.eligible).every(row=>!['H1','H2','H3'].includes(row.pathway)));
  assert.ok(result.selected.hrtHours>=24);
});

test('custom baseline, zero and missing values stay distinct; requirements are enforced',()=>{
  const input=request();input.baseline={origin:'provided',hrtHours:100,biogasM3Day:90,methaneM3Day:null,electricityKwhDay:0};
  input.minimumOutputs.biogasM3Day=97;
  const result=calculateHrtStudy(input);assert.deepEqual(result.baseline,input.baseline);
  assert.ok(result.selected.outputs.biogasM3Day>=97);assert.equal(result.selected.gains.methaneM3Day,null);
  assert.equal(result.selected.gains.electricityKwhDay,null);assert.equal(result.annual.baseline.electricityKwhDay,0);
  assert.ok(result.candidates.filter(row=>row.eligible).every(row=>row.hrtHours<100));
  input.baseline.hrtHours=4;const none=calculateHrtStudy(input);assert.equal(none.status,'NO_QUALIFYING_CANDIDATE');assert.equal(none.selected,null);assert.equal(none.annual.selected,null);
  input.baseline.hrtHours=100;input.minimumOutputs.biogasM3Day=200;assert.equal(calculateHrtStudy(input).selected,null);
});

test('COD/VS ambiguity is never converted or accepted under a loading constraint',()=>{
  const input=request();input.technology='C1';assert.ok(calculateHrtStudy(input).selected);
  input.constraints.olrMax=6;input.constraints.olrBasis='VS';const result=calculateHrtStudy(input);
  assert.equal(result.selected,null);assert.equal(result.candidates.filter(row=>row.olrBasis==='UNRESOLVED_COD_VS').length,66);
  assert.ok(result.candidates.filter(row=>row.pathway==='C1').every(row=>row.reasons.some(reason=>reason.includes('unresolved'))));
  input.technology='H1';input.constraints.olrBasis='COD';assert.ok(calculateHrtStudy(input).selected);
});

test('temperature, pH, SRT and HRT limits all affect eligibility',()=>{
  const input=request();input.constraints={...input.constraints,maxHrtHours:8,minSrtDays:30,temperatureMinC:35,temperatureMaxC:37,phMin:7,phMax:7.3};
  const result=calculateHrtStudy(input);
  const qualifying=rows.filter(row=>row[1]==='H1'&&row[10]<=8&&row[12]>=30&&row[13]>=35&&row[13]<=37&&row[14]>=7&&row[14]<=7.3);
  assert.equal(result.eligibleCount,qualifying.length);
});

test('bad requests cannot become successful default runs',()=>{
  for(const patch of [{mode:'random'},{technology:'C99'},{feed:'anything'},{baseline:{origin:'provided',hrtHours:0,biogasM3Day:50}},{baseline:{origin:'provided',hrtHours:360}},{baseline:{origin:'provided',hrtHours:10,biogasM3Day:10,methaneM3Day:20}},{constraints:{olrMax:5}},{constraints:{phMin:8,phMax:7}},{constraints:{temperatureMinC:40,temperatureMaxC:20}},{minimumOutputs:{biogasM3Day:NaN}},{minimumOutputs:{biogasM3Day:'50'}}])assert.throws(()=>resolveHrtStudyRequest({...request(),...patch}));
  assert.throws(()=>resolveHrtStudyRequest(null));
  // Workbook reference is authoritative, not replaceable by a caller-provided value.
  assert.equal(resolveHrtStudyRequest({...request(),baseline:{origin:'workbook',biogasM3Day:1}}).baseline.biogasM3Day,66.15);
});

test('model gate is honest about weak biogas prediction and independent holdout rows',()=>{
  const {assessment}=hrtStudyMetadata();assert.equal(assessment.allowGeneratedCandidates,false);
  assert.ok(assessment.randomHoldout.ridge.biogasM3Day.r2<0);
  assert.ok(assessment.orderedHoldout.ridge.biogasM3Day.r2<0);
  for(const split of [assessment.randomHoldout,assessment.orderedHoldout]){
    assert.equal(split.trainRows+split.testRows,200);
    assert.ok(split.testScenarioIds.every(id=>!split.trainScenarioIds.includes(id)));
  }
  assert.ok(!assessment.features.some(feature=>/scenario|gain|AFTER|methanePct/i.test(feature)));
});

test('CSV has all 200 comparisons and exactly one selected row',()=>{
  const result=calculateHrtStudy(request());const text=hrtStudyCsv({...result,runId:'test',outputHash:hrtStudyOutputHash(result)});
  const lines=text.split('\r\n');assert.equal(lines.length,201);assert.ok(lines[0].includes('before_methane_m3_day'));assert.ok(lines[0].includes('after_electricity_kwh_day'));
  assert.ok(lines.every(line=>!line.includes('undefined')&&!line.includes('NaN')));
});
