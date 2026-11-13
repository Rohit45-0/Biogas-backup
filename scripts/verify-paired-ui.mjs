import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const out=path.resolve('test-results/paired-scenarios');await mkdir(out,{recursive:true});
const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const base=`http://127.0.0.1:${port}`,password=randomUUID(),storage=path.join(out,'records-'+randomUUID());
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{windowsHide:true,env:{...process.env,VERCEL:'',BLOB_READ_WRITE_TOKEN:'',AQUA_AUDIT_DIR:storage,AQUA_SESSION_SECRET:randomUUID(),AQUA_ADMIN_USERNAME:'admin',AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:'user',AQUA_USER_PASSWORD:randomUUID()}});
let logs='',browser;server.stdout.on('data',value=>logs+=value);server.stderr.on('data',value=>logs+=value);
const keys=['biogasM3Day','methaneM3Day','electricityKwhDay'];
const numeric=text=>Number(text.replaceAll(',','').match(/-?\d+(?:\.\d+)?/)?.[0]);
function csv(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const char=text[i];if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(char===','&&!quoted){row.push(cell);cell='';}else if(char==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=char;}
  if(cell||row.length){row.push(cell);rows.push(row);}const header=rows.shift();return rows.map(values=>Object.fromEntries(header.map((key,index)=>[key.replace(/^\ufeff/,''),values[index]])));
}
try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/auth/session')).status===401){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,logs.slice(-2000));
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.getByLabel('Username',{exact:true}).fill('admin');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:/Continue/}).click();
  const study=page.locator('.hr-workspace'),sidebar=page.locator('.simple-sidebar');await study.getByText('Research model ready',{exact:true}).waitFor();
  async function navigate(name){if(await page.getByRole('button',{name:'Open navigation',exact:true}).isVisible())await page.getByRole('button',{name:'Open navigation',exact:true}).click();await sidebar.getByRole('button',{name,exact:true}).click();}
  // Reports must render safely before any run or verification error exists.
  await navigate('AI & KPI reports');
  await study.getByRole('heading',{name:'No report generated yet',exact:true}).waitFor();
  assert.equal(await study.getByRole('button',{name:'Generate first report',exact:true}).isEnabled(),true);
  assert.deepEqual(errors,[]);
  const runs=[];let latest;
  for(let i=0;i<3;i++){
    const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/research/hrt'&&response.request().method()==='POST');
    if(i===0)await study.getByRole('button',{name:'Generate first report',exact:true}).click();
    else await study.locator('.hr-header-actions').getByRole('button',{name:'Run AI optimization',exact:true}).click();
    const response=await pending;assert.equal(response.status(),200);latest=await response.json();
    await study.locator('.hr-footer').filter({hasText:latest.runId.slice(0,8)}).waitFor();
    assert.equal(latest.request.objective,'paired_gain');assert.equal(latest.candidates.length,2000);assert.equal(latest.pairedComparison.qualifyingCount,1272);assert.equal(latest.audit.saved,true);
    if(i===0){assert.equal(await study.locator('.rr-empty').count(),0);assert.equal(await study.locator('.rr-totals article').count(),4);}
    assert.ok(keys.every(key=>latest.pairedComparison.gains[key]>40));assert.ok(!runs.some(run=>run.candidate===latest.pairedComparison.input.id));
    assert.equal(await study.locator('.ic-demo').count(),0);assert.equal(await study.getByText('Simulated comparison',{exact:true}).count(),0);
    for(const [name,key] of [['Biogas','biogasM3Day'],['Methane','methaneM3Day'],['Electricity','electricityKwhDay']]){
      await navigate(name);const chart=study.locator(`.pd-chart .eb-comparison[data-metric="${key}"]`);
      assert.equal(await chart.getAttribute('data-source'),'model');
      for(const [period,days] of [['Day',1],['Month',30],['Year',365]]){
        await study.getByRole('button',{name:period,exact:true}).click();
        assert.ok(Math.abs(numeric(await chart.locator('b[data-value="selected"]').innerText())-latest.selected[key]*days)<=.051);
        assert.ok(Math.abs(numeric(await chart.locator('b[data-value="current"]').innerText())-latest.comparison[key]*days)<=.051);
        assert.ok(Math.abs(Number(await chart.getAttribute('data-gain-pct'))-latest.pairedComparison.gains[key])<1e-8);
        const widths=await chart.evaluate(el=>[...el.querySelectorAll('.eb-fluid-fill')].map(bar=>parseFloat(bar.style.width)));
        // Browsers round CSS percentage strings; check the rendered ratio at CSS precision.
        assert.ok(Math.abs(widths[0]/widths[1]-latest.selected[key]/latest.comparison[key])<1e-5);
      }
      if(i===2)await chart.screenshot({path:path.join(out,`${name.toLowerCase()}-desktop.png`)});
    }
    runs.push({id:latest.runId,candidate:latest.pairedComparison.input.id,hrt:latest.selected.hrtHours,baseline:latest.comparison,selected:latest.selected,gains:latest.pairedComparison.gains});
  }
  console.log('PASS: three UI runs, all output cards, period projections and proportional bars');
  await navigate('AI & KPI reports');
  for(const [i,value] of [latest.comparison.methaneM3Day,latest.selected.methaneM3Day,latest.comparison.electricityKwhDay,latest.selected.electricityKwhDay].entries())assert.ok(Math.abs(numeric(await study.locator('.rr-totals article strong').nth(i).innerText())-value*365)<=.51);
  const pendingDownload=page.waitForEvent('download');await study.getByRole('button',{name:'Export 12-month projection',exact:true}).click();const download=await pendingDownload;const monthly=csv(await readFile(await download.path(),'utf8'));assert.equal(monthly.length,12);
  for(const [label,key] of [['biogas_m3','biogasM3Day'],['methane_m3','methaneM3Day'],['electricity_kwh','electricityKwhDay']]){
    assert.ok(Math.abs(monthly.reduce((sum,row)=>sum+Number(row[`selected_${label}`]),0)-latest.selected[key]*365)<1e-8);
    assert.ok(Math.abs(monthly.reduce((sum,row)=>sum+Number(row[`comparison_${label}`]),0)-latest.comparison[key]*365)<1e-8);
  }
  assert.equal(monthly[0].candidate_id,latest.pairedComparison.input.id);
  const response=await context.request.get(base+`/api/research/hrt?runId=${latest.runId}&format=csv`);assert.equal(response.status(),200);const exported=csv(await response.text());assert.equal(exported.length,2000);assert.equal(exported.filter(row=>row.all_three_above_40==='true').length,1272);assert.equal(exported.filter(row=>row.selected_scenario==='true').length,1);
  for(const [index,row] of exported.entries()){
    const point=latest.candidates[index];assert.equal(row.candidate_id,point.paired.input.id);
    for(const [label,key] of [['biogas','biogasM3Day'],['methane','methaneM3Day'],['electricity','electricityKwhDay']]){const unit=label==='electricity'?'kwh_day':'m3_day';assert.equal(Number(row[`baseline_${label}_${unit}`]),point.paired.baseline[key]);assert.equal(Number(row[`predicted_${label}_${unit}`]),point[key]);assert.ok(Math.abs(Number(row[`${label}_gain_pct`])-(point[key]/point.paired.baseline[key]-1)*100)<1e-8);}
  }
  await study.getByRole('button',{name:'Verify saved run',exact:true}).click();await study.locator('.rr-verification h4').filter({hasText:'PASS'}).waitFor();
  const audit=await context.request.get(base+'/api/audit?runId='+latest.runId);assert.equal(audit.status(),200);const record=await audit.json();assert.equal(record.integrity,true);assert.deepEqual(record.record.response.selected,latest.selected);
  const copilot=await context.request.post(base+'/api/copilot',{data:{mode:'HOURS_RESEARCH',researchRunId:latest.runId,question:'Explain the selected baseline and gain'}});assert.equal(copilot.status(),200);assert.match((await copilot.json()).answer,/1,?272|1272/);
  console.log('PASS: 2,000 CSV comparisons, monthly/annual reconciliation, saved audit replay and Copilot');
  await navigate('Workbook AI reading');await study.getByRole('heading',{name:'Original 200 source records'}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('.hr-panel:last-of-type tbody tr').length===200);
  await navigate('Process monitor');await study.locator('.rpm-identifiers summary').click();assert.match(await study.locator('.rpm-backend-events').innerText(),/Ridge/);assert.equal(await study.locator('.rpm-stage').count(),8);
  await navigate('AI optimizer');assert.match(await study.innerText(),new RegExp(latest.pairedComparison.input.id));
  await navigate('Electricity');
  const layouts=[];
  for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1280,720],[1024,768],[768,1024],[390,844],[320,760]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(150);
    const chart=study.locator('.eb-comparison');
    const fit=await chart.evaluate(el=>{const rect=el.getBoundingClientRect(),graph=el.querySelector('.eb-fluid-chart'),texts=[...el.querySelectorAll('.eb-fluid-label,.eb-fluid-axis,.eb-values small')];return {left:rect.left,right:rect.right,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,chartWidth:el.clientWidth,scrollWidth:el.scrollWidth,graphWidth:graph.clientWidth,graphScroll:graph.scrollWidth,minTextSize:Math.min(...texts.map(node=>parseFloat(getComputedStyle(node).fontSize)))};});
    assert.ok(fit.documentWidth<=width+1,JSON.stringify({width,fit}));assert.ok(fit.right<=width+1&&fit.left>=0,JSON.stringify({width,fit}));assert.ok(fit.scrollWidth<=fit.chartWidth+1,JSON.stringify({width,fit}));assert.ok(fit.graphScroll<=fit.graphWidth+1);assert.ok(fit.minTextSize>=16);
    layouts.push({width,height,...fit});if([1366,390,320].includes(width))await chart.screenshot({path:path.join(out,`electricity-${width}.png`)});
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(out,'verification.json'),JSON.stringify({passed:true,runs,layouts,csvRows:exported.length,monthlyRows:monthly.length,browserErrors:errors},null,2));
  console.log('PASS: responsive bars at eight viewport sizes, readable text, no page overflow');
}finally{
  await browser?.close();if(server.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}
  await writeFile(path.join(out,'server.log'),logs);
}
