import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {monitoringSource,advance,crossingCounts,CURRENT_MONITORING_VERSION,DEMO_VERSION}=require('../app/lib/demo-monitoring.ts');
const {fingerprint}=require('../app/lib/evidence.ts');
const workbook=require('../data/early-warning/source.json'),archived=require('./fixtures/monitoring-v1.json');
test('400 monitoring records preserve supplied values and timestamps without hidden truth or future labels',()=>{
 const source=monitoringSource();assert.equal(source.rows.length,400);assert.equal(new Set(source.rows.map(r=>r.t)).size,400);
 for(let i=0;i<400;i++){const row=source.rows[i],input=workbook.rows[i];assert.equal(row.t,input.Timestamp);assert.equal(row.gas,input.Biogas_Flow_Nm3h);assert.equal(row.h2s,input.H2S_Gas_Outlet_ppm);assert.equal(row.feed,input.Feed_m3h);assert.equal(row.ch4,input.CH4_pct);assert.equal(row.kw,input.Generator_kW);assert.ok(Math.abs(row.codRemoval-100*(input.COD_In_mgL-input.COD_Out_mgL)/input.COD_In_mgL)<1e-10);assert.ok(Object.values(row).every(v=>typeof v==='string'||Number.isFinite(v)));assert.ok(Object.keys(row).every(k=>!/(hidden|future|label|scenario|score)/i.test(k)));}
 assert.equal(source.metadata.sourceTotalRows,480);assert.equal(source.metadata.workbookSha256,workbook.metadata.sha256);
});
test('400-row replay reaches its final distinct hour and rejects wrap or outside indices',()=>{
 const at='2026-11-10T20:00:00Z';let snapshot=advance(null,{action:'start'},'start',at,'test',CURRENT_MONITORING_VERSION);
 snapshot=advance(snapshot,{action:'sample',index:399},'last',at,'test');assert.equal(snapshot.sourceIndex,399);assert.equal(snapshot.reading.t,'2026-10-17 15:00');
 assert.throws(()=>advance(snapshot,{action:'step'},'no-wrap',at,'test'),/1 to 400/);assert.throws(()=>advance(snapshot,{action:'sample',index:400},'out',at,'test'),/1 to 400/);assert.equal(monitoringSource(DEMO_VERSION).rows.length,58);
});
test('original production v1 snapshot hashes and command replay are unchanged',()=>{
 for(const record of archived){const parent=record.request.parentId?archived.find(r=>r.id===record.request.parentId).snapshot:null;const s=record.snapshot;assert.equal(s.version,DEMO_VERSION);assert.equal(fingerprint(monitoringSource(s.version).rows),record.manifestHash);assert.equal(fingerprint(advance(parent,record.request.command,s.id,s.createdAt,s.actor,s.version)),record.responseHash);}
});
test('alarm crossings use the selected source rather than archived 58-row counts',()=>{
 const counts=Object.fromEntries(crossingCounts(monitoringSource().rows).map(r=>[r.id,[r.warning,r.critical]]));
 assert.deepEqual(counts.h2sHigh,[9,13]);assert.deepEqual(counts.gasLow,[85,24]);assert.deepEqual(counts.kwLow,[27,32]);assert.deepEqual(counts.tempLow,[7,13]);assert.deepEqual(crossingCounts().find(r=>r.id==='h2sHigh').critical,0);
 assert.throws(()=>monitoringSource('unrecognized'),/Unknown monitoring source/);
});
