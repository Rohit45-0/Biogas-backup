import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const out=path.resolve('test-results/workbook-comparison');await mkdir(out,{recursive:true});
let base=process.env.AQUA_TEST_URL,password=process.env.AQUA_COMPARE_PASSWORD,server,browser,logs='';
if(!base){
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
 base=`http://127.0.0.1:${port}`;password=randomUUID();
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{windowsHide:true,env:{...process.env,VERCEL:'',BLOB_READ_WRITE_TOKEN:'',AQUA_AUDIT_DIR:path.join(out,'records-'+randomUUID()),AQUA_SESSION_SECRET:randomUUID(),AQUA_ADMIN_USERNAME:'admin',AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:'user',AQUA_USER_PASSWORD:randomUUID()}});
 server.stdout.on('data',v=>logs+=v);server.stderr.on('data',v=>logs+=v);
}
assert.ok(password,'Supply the password when testing a deployment');
const numeric=text=>Number(text.replaceAll(',','').match(/-?\d+(?:\.\d+)?/)?.[0]);
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/auth/session')).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs.slice(-1500));
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(45000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);await page.getByLabel('Username',{exact:true}).fill('admin');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:/Continue/}).click();
 const study=page.locator('.hr-workspace'),sidebar=page.locator('.simple-sidebar');await study.getByText('Research model ready',{exact:true}).waitFor();
 async function navigate(name){if(await page.evaluate(()=>innerWidth<=900)&&!(await sidebar.getAttribute('class')).includes('is-open'))await page.getByRole('button',{name:'Open navigation'}).click();await sidebar.getByRole('button',{name,exact:true}).click();}
 await study.getByRole("button",{name:"Study settings",exact:true}).click();await study.getByLabel("Scenario mode",{exact:true}).selectOption("workbook");await study.getByRole("button",{name:"Study settings",exact:true}).click();
 const runs=[];
 for(let i=0;i<3;i++){
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/research/hrt'&&r.request().method()==='POST');
  await study.locator('.hr-header-actions').getByRole('button',{name:'Run AI optimization',exact:true}).click();
  const response=await pending;assert.equal(response.status(),200);const run=await response.json();
  await study.locator('.hr-footer').filter({hasText:run.runId.slice(0,8)}).waitFor();
  assert.equal(run.request.objective,'workbook_gain');assert.equal(run.candidateCount,2000);assert.equal(run.workbookBaseline.qualifyingCount,956);assert.equal(run.workbookBaseline.biogasM3Day,50);assert.ok(run.workbookBaseline.selectedGainPct>=50);
  assert.ok(!runs.some(previous=>previous.hrt===run.selected.hrtHours));
  const energy=run.energyComparison;assert.equal(energy.basis,'MODELLED_2H_ENERGY_STUDY');assert.equal(energy.baseline.hrtHours,2);assert.equal(energy.qualifyingCount,1070);assert.ok(energy.methaneGainPct>=50&&energy.electricityGainPct>=50);assert.ok(energy.biogasChangePct<0);assert.ok(!runs.some(previous=>previous.energyHrt===energy.selected.hrtHours));
  assert.equal(run.comparison,null);assert.equal(run.retentionTime.beforeHours,null);
  assert.ok(Math.abs(run.selected.electricityKwhDay-run.selected.methaneM3Day*9.97*.36)<1e-8);
  assert.equal(await study.locator('.ic-demo').count(),0);
  for(const [name,key] of [['Biogas','biogasM3Day'],['Methane','methaneM3Day'],['Electricity','electricityKwhDay']]){
   await navigate(name);const chart=study.locator(`.pd-chart .eb-comparison[data-metric="${key}"]`);
   assert.equal(await chart.getAttribute('data-source'),'model');assert.equal(await chart.getByRole('button',{name:'Simulated comparison'}).count(),0);
   for(const [period,days] of [['Day',1],['Month',30],['Year',365]]){
    await study.getByRole('button',{name:period,exact:true}).click();
    const chosen=key==='biogasM3Day'?run.selected:energy.selected;
    assert.ok(Math.abs(numeric(await chart.locator('[data-value="selected"]').innerText())-chosen[key]*days)<=.051);
    if(key==='biogasM3Day'){
     assert.ok(Number(await chart.getAttribute('data-gain-pct'))>=50);
     assert.equal(numeric(await chart.locator('[data-value="current"]').innerText()),50*days);
     const ratio=await chart.evaluate(el=>parseFloat(el.querySelector('.eb-fill-selected').style.width)/parseFloat(el.querySelector('.eb-fill-baseline').style.width));assert.ok(Math.abs(ratio-run.selected.biogasM3Day/50)<1e-5);
    }else{
     assert.ok(Math.abs(numeric(await chart.locator('[data-value="current"]').innerText())-energy.baseline[key]*days)<=.051);assert.ok(Number(await chart.getAttribute('data-gain-pct'))>=50);assert.match(await chart.innerText(),/2 h baseline/);
     const ratio=await chart.evaluate(el=>parseFloat(el.querySelector('.eb-fill-selected').style.width)/parseFloat(el.querySelector('.eb-fill-baseline').style.width));assert.ok(Math.abs(ratio-chosen[key]/energy.baseline[key])<1e-5);
     assert.match(await study.locator('[data-comparison-basis="separate-studies"]').innerText(),/Energy-study biogas.*-/);
    }
   }
   if(i===2)await chart.screenshot({path:path.join(out,name.toLowerCase()+'.png')});
   await study.getByRole('button',{name:'HRT curve',exact:true}).click();const curve=study.locator('.pd-chart .rc-comparison');assert.ok(Math.abs(numeric(await curve.locator('[data-value="selected"]').innerText())-(key==='biogasM3Day'?run.selected[key]:energy.selected[key]))<=.051);assert.ok(Math.abs(numeric(await curve.locator('[data-value="current"]').innerText())-(key==='biogasM3Day'?50:energy.baseline[key]))<=.051);
  }
  await navigate('AI & KPI reports');assert.equal(await study.locator('.ic-demo').count(),0);
  assert.match(await study.locator('.rr-improvement [data-metric="biogasM3Day"]').innerText(),/\+/);
  assert.match(await study.locator('.rr-improvement [data-metric="electricityKwhDay"]').innerText(),/\+/);
  for(const [index,value] of [energy.baseline.methaneM3Day,energy.selected.methaneM3Day,energy.baseline.electricityKwhDay,energy.selected.electricityKwhDay].entries())assert.ok(Math.abs(numeric(await study.locator('.rr-totals article strong').nth(index).innerText())-value*365)<=.51);
  const row=study.locator('.rr-table-scroll tbody tr').first();assert.equal(numeric(await row.locator('td').nth(0).innerText()),1550);assert.ok(Math.abs(numeric(await row.locator('td').nth(1).innerText())-31*run.selected.biogasM3Day)<=.51);
  assert.ok(Math.abs(numeric(await row.locator('td').nth(2).innerText())-31*energy.selected.methaneM3Day)<=.51);assert.ok(Math.abs(numeric(await row.locator('td').nth(3).innerText())-31*energy.selected.electricityKwhDay)<=.51);
  const evidence=await context.request.get(base+'/api/audit?runId='+run.runId);assert.equal(evidence.status(),200);const record=await evidence.json();assert.equal(record.integrity,true);assert.deepEqual(record.record.response.selected,run.selected);assert.deepEqual(record.record.response.workbookBaseline,run.workbookBaseline);assert.deepEqual(record.record.response.energyComparison,energy);
  const verify=await context.request.post(base+'/api/research/hrt/verify',{data:{runId:run.runId}});assert.equal(verify.status(),200);assert.equal((await verify.json()).status,'PASS');
  const csvResponse=await context.request.get(base+'/api/research/hrt?runId='+run.runId+'&format=csv');assert.equal(csvResponse.status(),200);const lines=(await csvResponse.text()).trim().split(/\r?\n/);assert.equal(lines.length,2001);const cells=line=>JSON.parse('['+line+']');const columns=cells(lines[0]),rows=lines.slice(1).map(cells);assert.equal(rows.filter(row=>row[columns.indexOf('workbook_50pct_qualifies')]==='true').length,956);assert.ok(rows.every(row=>row[columns.indexOf('baseline_hrt_hours')]===''));assert.equal(rows.filter(row=>row[columns.indexOf('selected_scenario')]==='true').length,1);
  assert.equal(rows.filter(row=>row[columns.indexOf('energy_50pct_qualifies')]==='true').length,1070);assert.equal(rows.filter(row=>row[columns.indexOf('energy_selected_scenario')]==='true').length,1);assert.ok(rows.every(row=>row[columns.indexOf('energy_baseline_hrt_hours')]==='2'));
  const selectedRow=rows.find(row=>row[columns.indexOf('energy_selected_scenario')]==='true');assert.equal(Number(selectedRow[columns.indexOf('electricity_kwh_day')]),energy.selected.electricityKwhDay);
  const copilot=await context.request.post(base+'/api/copilot',{data:{mode:'HOURS_RESEARCH',researchRunId:run.runId,question:'Why is this baseline used and how do the values change?'}});assert.equal(copilot.status(),200);assert.match((await copilot.json()).answer,/two studies select different operating scenarios/);
  if(i===2){
   const downloadPending=page.waitForEvent('download');await study.getByRole('button',{name:'Export 12-month projection',exact:true}).click();const download=await downloadPending,downloadPath=path.join(out,'monthly.csv');await download.saveAs(downloadPath);const projectionLines=(await readFile(downloadPath,'utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/),projectionCols=cells(projectionLines[0]),projectionRows=projectionLines.slice(1).map(cells);assert.equal(projectionRows.length,12);
   for(const [key,value] of [['selected_methane_m3',energy.selected.methaneM3Day],['selected_electricity_kwh',energy.selected.electricityKwhDay],['comparison_electricity_kwh',energy.baseline.electricityKwhDay]])assert.ok(Math.abs(projectionRows.reduce((sum,row)=>sum+Number(row[projectionCols.indexOf(key)]),0)-365*value)<1e-7);
   assert.ok(projectionRows.every(row=>Number(row[projectionCols.indexOf('energy_selected_hrt_hours')])===energy.selected.hrtHours));
   await study.locator('.rr-improvement').screenshot({path:path.join(out,'report-gains.png')});
  }
  runs.push({runId:run.runId,hrt:run.selected.hrtHours,gainPct:run.workbookBaseline.selectedGainPct,energyHrt:energy.selected.hrtHours,energyGainPct:energy.electricityGainPct,energyBiogasChangePct:energy.biogasChangePct});
 }
 await navigate('Process monitor');assert.match(await study.locator('.rpm-workspace').innerText(),/Calculation complete/);
 const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/research/hrt'&&r.request().method()==='POST');await study.locator('.rpm-trace').getByRole('button',{name:'Run AI workflow',exact:true}).click();const workflow=await (await pending).json();await study.locator('.hr-footer').filter({hasText:workflow.runId.slice(0,8)}).waitFor();await study.locator('.rpm-trace-footer').waitFor();assert.ok(!runs.some(run=>run.hrt===workflow.selected.hrtHours));assert.ok(workflow.workbookBaseline.selectedGainPct>=50);
 await navigate('Biogas');await study.getByRole('button',{name:'HRT curve',exact:true}).click();assert.equal(numeric(await study.locator('.rc-comparison [data-value="current"]').innerText()),50);
 assert.ok(!runs.some(run=>run.energyHrt===workflow.energyComparison.selected.hrtHours));
 await navigate('AI optimizer');assert.match(await study.innerText(),/Energy-focused operating recommendation/);assert.equal(await study.locator('[data-comparison-basis="separate-studies"]').count(),1);
 await navigate('Electricity');
 for(const width of [1920,1440,1366,1280,900,768,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Page overflow at ${width}`);}
 await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
 const proof={status:'PASS',checkedAt:new Date().toISOString(),base,runs,workflowRun:workflow.runId,qualifiedCount:956,energyQualifiedCount:1070,modelOutputsAndAuditVerified:true,energyBaseline:'Fitted model at 2-hour HRT',separateStudiesAndBiogasTradeoffVisible:true};await writeFile(path.join(out,process.env.AQUA_TEST_URL?'live-verification.json':'local-verification.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
}finally{if(browser)await browser.close();if(server&&server.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}}
