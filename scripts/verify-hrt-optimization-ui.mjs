import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const out=path.resolve('test-results/hrt-optimization');await mkdir(out,{recursive:true});
const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const base=`http://127.0.0.1:${port}`,password=randomUUID(),storage=path.join(out,'records-'+randomUUID());
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{windowsHide:true,env:{...process.env,VERCEL:'',BLOB_READ_WRITE_TOKEN:'',AQUA_AUDIT_DIR:storage,AQUA_SESSION_SECRET:randomUUID(),AQUA_ADMIN_USERNAME:'admin',AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:'user',AQUA_USER_PASSWORD:password}});
let logs='',browser;server.stdout.on('data',value=>logs+=value);server.stderr.on('data',value=>logs+=value);
const endpoint='/api/research/hrt-optimization',keys=['biogasM3Day','methaneM3Day','electricityKwhDay'];
const numeric=text=>Number(text.replaceAll(',','').match(/-?\d+(?:\.\d+)?/)?.[0]);
function csv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const char=text[i];if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(char===','&&!quoted){row.push(cell);cell='';}else if(char==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=char;}if(cell||row.length){row.push(cell);rows.push(row);}const header=rows.shift();return rows.map(values=>Object.fromEntries(header.map((key,index)=>[key,values[index]])));}
try{
  let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/api/auth/session')).status===401){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,logs.slice(-2000));
  assert.equal((await fetch(base+endpoint)).status,401);
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(30000);
  await page.goto(base);await page.getByLabel('Username',{exact:true}).fill('admin');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:/Continue/}).click();
  await page.getByText('Research model ready',{exact:true}).waitFor();
  async function navigate(name){if(await page.getByRole('button',{name:'Open navigation',exact:true}).isVisible())await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.locator('.simple-sidebar').getByRole('button',{name,exact:true}).click();}
  await page.getByRole('region',{name:'New Task 2 feature'}).waitFor();assert.equal(await page.locator('.sidebar-task2-badge').innerText(),'Task 2');await page.getByRole('button',{name:'Open Task 2',exact:true}).click();const study=page.getByRole('region',{name:'Task 2 HRT optimization'});
  await study.getByRole('button',{name:'Run HRT optimization',exact:true}).waitFor();
  async function run(){const pending=page.waitForResponse(response=>new URL(response.url()).pathname===endpoint&&response.request().method()==='POST');await study.getByRole('button',{name:'Run HRT optimization',exact:true}).click();const response=await pending;assert.equal(response.status(),200);const result=await response.json();await study.getByRole('button',{name:'Run HRT optimization',exact:true}).waitFor();return result;}
  const first=await run();assert.equal(first.selected.id,'HRT-0163');assert.equal(first.selected.hrtHours,4.8);assert.equal(first.eligibleCount,23);assert.equal(first.audit.saved,true);assert.equal(first.candidateCount,200);assert.equal(first.generatedCandidateCount,0);
  for(const [label,days] of [['Day',1],['Year',365]]){
    await study.getByRole('button',{name:label,exact:true}).click();
    for(const key of keys){const chart=study.locator(`.h2-chart[data-metric="${key}"]`);assert.ok(Math.abs(numeric(await chart.locator('[data-value=baseline]').innerText())-first.baseline[key]*days)<.0051);assert.ok(Math.abs(numeric(await chart.locator('[data-value=selected]').innerText())-first.selected.outputs[key]*days)<.0051);const widths=await chart.locator('.h2-bar-fill').evaluateAll(els=>els.map(el=>parseFloat(el.style.width)));assert.ok(Math.abs(widths[1]/widths[0]-first.selected.outputs[key]/first.baseline[key])<1e-5);}
  }
  await study.getByRole('button',{name:'Day',exact:true}).click();
  const layouts=[];
  for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1280,720],[768,1024],[390,844],[320,760]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    const fit=await study.evaluate(el=>({documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,width:el.clientWidth,scrollWidth:el.scrollWidth,charts:[...el.querySelectorAll('.h2-chart')].map(chart=>({width:chart.clientWidth,scrollWidth:chart.scrollWidth}))}));
    assert.ok(fit.documentWidth<=width+1,JSON.stringify({width,fit}));assert.ok(fit.scrollWidth<=fit.width+1,JSON.stringify({width,fit}));assert.ok(fit.charts.every(chart=>chart.scrollWidth<=chart.width+1));layouts.push({width,height,...fit});
    if([1440,390].includes(width)){await study.locator('.h2-result-heading').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`results-${width}.png`)});}
  }
  await page.setViewportSize({width:1440,height:1000});
  await study.getByRole('button',{name:'Verify saved run',exact:true}).click();await study.getByText('PASS: saved values and deterministic replay agree.',{exact:true}).waitFor();
  const exported=await context.request.get(base+endpoint+`?runId=${first.runId}&format=csv`);assert.equal(exported.status(),200);const records=csv(await exported.text());assert.equal(records.length,200);assert.equal(records.filter(row=>row.selected==='true').length,1);
  for(const row of records){const point=first.candidates.find(item=>item.id===row.scenario_id);assert.equal(Number(row.after_biogas_m3_day),point.outputs.biogasM3Day);assert.equal(Number(row.after_methane_m3_day),point.outputs.methaneM3Day);assert.equal(Number(row.after_electricity_kwh_day),point.outputs.electricityKwhDay);assert.equal(Number(row.before_electricity_kwh_year),first.baseline.electricityKwhDay*365);}
  const replayResponse=await context.request.post(base+endpoint,{data:first.request}),replayed=await replayResponse.json();assert.equal(replayed.outputHash,first.outputHash);assert.notEqual(replayed.runId,first.runId);
  const audit=await context.request.get(base+'/api/audit?runId='+first.runId),record=await audit.json();assert.equal(record.integrity,true);assert.equal(record.record.kind,'hrt_optimization');assert.deepEqual(record.record.response.selected,first.selected);
  const list=await (await context.request.get(base+'/api/audit?limit=50')).json();assert.ok(list.runs.some(row=>row.id===first.runId));
  const alteredPath=path.join(storage,'audit-v2','records',replayed.runId+'.json');
  const altered=JSON.parse(await readFile(alteredPath,'utf8'));altered.response.selected.hrtHours=.1;await writeFile(alteredPath,JSON.stringify(altered));
  assert.equal((await context.request.get(base+endpoint+`?runId=${replayed.runId}&verify=true`)).status(),409);
  assert.equal((await context.request.get(base+endpoint+`?runId=${replayed.runId}&format=csv`)).status(),409);
  assert.equal((await context.request.get(base+endpoint+'?runId='+randomUUID())).status(),404);
  await study.getByRole('button',{name:'Open in Audit Trail',exact:true}).click();await page.getByRole('heading',{name:'Retrieved evidence',exact:true}).waitFor();
  await navigate('HRT in hours');await study.getByTestId('hrt-after').waitFor();assert.equal(numeric(await study.getByTestId('hrt-after').innerText()),4.8);
  // Exercise changed user input, no qualifying result, exclusion reasons and reload persistence.
  await study.getByLabel('Baseline source',{exact:true}).selectOption('provided');await study.getByLabel('Baseline HRT (hours)',{exact:true}).fill('4');await study.getByLabel('Baseline biogas (m³/day)',{exact:true}).fill('66.15');
  await study.getByText(/Settings changed\. Results and exports/).waitFor();const noResult=await run();assert.equal(noResult.selected,null);assert.equal(noResult.status,'NO_QUALIFYING_CANDIDATE');assert.equal(await study.locator('.h2-chart').count(),0);
  await study.getByLabel('Include excluded scenarios',{exact:true}).check();assert.equal(await study.locator('tbody tr').count(),200);
  await study.getByLabel('Baseline source',{exact:true}).selectOption('workbook');await study.getByLabel('Study mode',{exact:true}).selectOption('upgrade');await study.getByLabel('Feed category',{exact:true}).selectOption('solids');
  const solids=await run();assert.ok(!['H1','H2','H3'].includes(solids.selected.pathway));assert.ok(solids.selected.hrtHours>=24);
  await page.reload();await page.getByText('Research model ready',{exact:true}).waitFor();await navigate('HRT in hours');await study.getByTestId('hrt-after').waitFor();assert.equal(numeric(await study.getByTestId('hrt-after').innerText()),solids.selected.hrtHours);
  // Invalid inputs and authorization boundaries.
  assert.equal((await context.request.post(base+endpoint,{data:{...first.request,technology:'invalid'}})).status(),422);
  assert.equal((await context.request.post(base+endpoint,{data:Buffer.from('{invalid'),headers:{'Content-Type':'application/json'}})).status(),400);
  assert.equal((await context.request.post(base+endpoint,{data:'x'.repeat(8001)})).status(),413);
  const user=await browser.newContext();await user.request.post(base+'/api/auth/login',{data:{username:'user',password}});
  assert.equal((await user.request.get(base+endpoint)).status(),200);assert.equal((await user.request.post(base+endpoint,{data:first.request})).status(),403);assert.equal((await user.request.get(base+endpoint+'?runId='+first.runId)).status(),403);await user.close();
  // Task 1 is still a separate model run and its reports still render.
  await navigate('Biogas');const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/research/hrt'&&response.request().method()==='POST');await page.locator('.hr-header-actions').getByRole('button',{name:'Run AI optimization',exact:true}).click();const task1=await (await pending).json();assert.equal(task1.candidateCount,2000);assert.ok(task1.pairedComparison);assert.equal(task1.audit.saved,true);
  await navigate('AI & KPI reports');await page.getByRole('heading',{name:'Saved optimization results',exact:true}).waitFor();assert.equal(await page.locator('.rr-totals article').count(),4);
  await navigate('HRT in hours');await study.getByTestId('hrt-after').waitFor();await page.getByRole('button',{name:'Existing HRT study',exact:true}).click();await page.getByRole('heading',{name:'HRT in Hours',exact:true}).waitFor();assert.equal(await page.locator('.h2-study').count(),0);assert.match(await page.locator('.hr-workspace').innerText(),new RegExp(task1.pairedComparison.input.id));await navigate('Overview');await page.getByRole('button',{name:'Open Task 2',exact:true}).click();await study.getByTestId('hrt-after').waitFor();assert.deepEqual(errors,[]);
  await writeFile(path.join(out,'verification.json'),JSON.stringify({passed:true,defaultResult:first,solidsResult:solids.selected,noQualifyingResult:noResult.status,csvRows:records.length,layouts,browserErrors:errors,task1RunId:task1.runId},null,2));
  console.log('PASS: local login, HRT selection, all before/after charts, 200-row CSV, audit replay/listing, input changes, no-result behavior, role boundaries, seven screen sizes, Task 1 and reports');
}finally{
  await browser?.close();if(server.exitCode===null){const exited=once(server,'exit');server.kill();await exited;}
  await writeFile(path.join(out,'server.log'),logs);
}
