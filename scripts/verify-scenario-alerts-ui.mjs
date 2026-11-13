import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const live=process.env.AQUA_VERIFY_URL;
const out=path.resolve('test-results/scenario-alerts',live?'live':'local');await mkdir(out,{recursive:true});
let base=live,password=process.env.AQUA_VERIFY_PASSWORD,server,browser,logs='';
if(!live){
  const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  base=`http://127.0.0.1:${port}`;password=randomUUID();
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{windowsHide:true,env:{...process.env,VERCEL:'',BLOB_READ_WRITE_TOKEN:'',AQUA_AUDIT_DIR:path.join(out,'records-'+randomUUID()),AQUA_SESSION_SECRET:randomUUID(),AQUA_ADMIN_USERNAME:'admin',AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:'user',AQUA_USER_PASSWORD:password}});
  server.stdout.on('data',value=>logs+=value);server.stderr.on('data',value=>logs+=value);
}
const endpoint='/api/research/input-check',checks=[],layouts=[],errors=[];
try{
  assert.ok(password,'Verification password required');
  let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base+'/api/auth/session')).status===401){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,logs.slice(-2000));
  assert.equal((await fetch(base+endpoint)).status,401);assert.equal((await fetch(base+endpoint,{method:'POST',body:'{}'})).status,401);
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.getByLabel('Username',{exact:true}).fill('admin');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:/Continue/}).click();await page.getByText('Research model ready',{exact:true}).waitFor();
  async function navigate(name){if(await page.getByRole('button',{name:'Open navigation',exact:true}).isVisible())await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.locator('.simple-sidebar').getByRole('button',{name,exact:true}).click();}
  const catalog=await (await context.request.get(base+endpoint)).json(),first=catalog.contexts[0],manual={stream:'manual',contextId:first.id,values:first.example};
  assert.ok(catalog.contexts.some(item=>item.id==='task2:H1'));
  assert.equal((await context.request.post(base+endpoint,{data:{...manual,contextId:'wrong'}})).status(),422);
  assert.equal((await context.request.post(base+endpoint,{data:Buffer.from('{invalid'),headers:{'Content-Type':'application/json'}})).status(),400);
  assert.equal((await context.request.post(base+endpoint,{data:'x'.repeat(8001)})).status(),413);
  const missing=await (await context.request.post(base+endpoint,{data:{...manual,values:{}}})).json();assert.equal(missing.status,'PARTIAL_CHECK');
  if(!live){const user=await browser.newContext();await user.request.post(base+'/api/auth/login',{data:{username:'user',password}});assert.equal((await user.request.post(base+endpoint,{data:manual})).status(),200);await user.close();}
  await navigate('Alerts');const panel=page.getByRole('region',{name:'Scenario input monitoring'}),banner=page.getByRole('alert',{name:'Scenario input notification'});
  await panel.getByRole('button',{name:'Check scenario inputs',exact:true}).waitFor();
  async function check(button){
    const pending=page.waitForResponse(response=>new URL(response.url()).pathname===endpoint&&response.request().method()==='POST');
    await panel.getByRole('button',{name:button,exact:true}).click();const response=await pending;assert.equal(response.status(),200);const result=await response.json();checks.push(result);await panel.getByRole('button',{name:'Check scenario inputs',exact:true}).waitFor();await page.waitForTimeout(100);return result;
  }
  assert.equal((await check('Check scenario inputs')).status,'WITHIN_SCENARIO_RANGES');assert.equal(await banner.count(),0);
  const outside=await check('Try out-of-range example');assert.equal(outside.status,'OUT_OF_RANGE');assert.equal(outside.outsideCount,1);await banner.waitFor();assert.match(await banner.innerText(),/Temperature/);assert.equal(await page.locator('.sa-bell .sa-count').innerText(),'1');
  await check('Check scenario inputs');assert.equal(await panel.locator('.sa-history article[data-state=active]').count(),1);
  await navigate('Overview');await banner.waitFor();await page.reload();await page.getByText('Research model ready',{exact:true}).waitFor();await banner.waitFor();
  await banner.getByRole('button',{name:'Review alerts',exact:true}).click();await panel.waitFor();
  for(const [width,height] of [[1440,1000],[390,844],[320,760]]){
    await page.setViewportSize({width,height});await panel.scrollIntoViewIfNeeded();await page.waitForTimeout(100);
    const fit=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth}));assert.ok(fit.documentWidth<=width+1,JSON.stringify(fit));layouts.push(fit);
    await banner.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`notification-${width}.png`)});
  }
  await page.setViewportSize({width:1440,height:1000});await banner.getByRole('button',{name:'Acknowledge',exact:true}).click();await banner.waitFor({state:'hidden'});assert.equal(await page.locator('.sa-bell .sa-count').innerText(),'1');assert.match(await panel.locator('.sa-history article[data-state=active]').innerText(),/Active · acknowledged/);
  await panel.getByRole('button',{name:'Load in-range example',exact:true}).click();assert.equal((await check('Check scenario inputs')).status,'WITHIN_SCENARIO_RANGES');assert.equal(await page.locator('.sa-bell .sa-count').count(),0);assert.equal(await panel.locator('.sa-history article[data-state=resolved]').count(),1);
  await check('Try out-of-range example');await banner.waitFor();await panel.getByLabel('Scenario Temperature',{exact:true}).fill('');assert.equal((await check('Check scenario inputs')).status,'PARTIAL_CHECK');assert.equal(await panel.locator('.sa-history article[data-state=active]').count(),1);
  // Network failure must be visible and must not clear an existing warning.
  await page.route('**/api/research/input-check',route=>route.request().method()==='POST'?route.abort('failed'):route.continue());await panel.getByRole('button',{name:'Check scenario inputs',exact:true}).click();await panel.getByText(/Scenario range check unavailable:/).waitFor();assert.equal(await panel.locator('.sa-history article[data-state=active]').count(),1);await page.unroute('**/api/research/input-check');
  await panel.getByRole('button',{name:'Load in-range example',exact:true}).click();await check('Check scenario inputs');await banner.waitFor({state:'hidden'});
  await panel.getByLabel('Scenario pathway',{exact:true}).selectOption('task2:C1');assert.equal((await check('Check scenario inputs')).status,'PARTIAL_CHECK');assert.match(await panel.locator('.sa-check-result').innerText(),/Units unresolved/);assert.equal(await banner.count(),0);
  // Manual trajectory input outside the fitted HRT range is reported without running the model.
  await panel.getByLabel('Scenario pathway',{exact:true}).selectOption('hours');await panel.getByLabel('Scenario HRT',{exact:true}).fill('25');assert.equal((await check('Check scenario inputs')).status,'OUT_OF_RANGE');await banner.waitFor();assert.match(await banner.innerText(),/25 h/);await panel.getByRole('button',{name:'Load in-range example',exact:true}).click();await check('Check scenario inputs');await banner.waitFor({state:'hidden'});
  // The real model flows automatically submit their actual selected input to the checker.
  async function optimize(button,modelPath){
    const model=page.waitForResponse(response=>new URL(response.url()).pathname===modelPath&&response.request().method()==='POST');
    const checked=page.waitForResponse(response=>new URL(response.url()).pathname===endpoint&&response.request().method()==='POST');
    await button.click();const response=await model;assert.equal(response.status(),200);const result=await response.json();const inputCheck=await (await checked).json();checks.push(inputCheck);assert.equal(inputCheck.runId,result.runId);assert.equal(inputCheck.outsideCount,0);return result;
  }
  await navigate('Biogas');const task1=await optimize(page.locator('.hr-header-actions').getByRole('button',{name:'Run AI optimization',exact:true}),'/api/research/hrt');assert.equal(task1.candidateCount,2000);assert.ok(task1.pairedComparison);assert.ok(task1.audit.saved);assert.equal(checks.at(-1).stream,'task1');
  await navigate('Overview');await page.getByRole('button',{name:'Open Task 2',exact:true}).click();const study=page.getByRole('region',{name:'Task 2 HRT optimization'});
  const task2=await optimize(study.getByRole('button',{name:'Run HRT optimization',exact:true}),'/api/research/hrt-optimization');assert.equal(task2.selected.id,'HRT-0163');assert.equal(task2.selected.hrtHours,4.8);assert.equal(task2.baseline.hrtHours,360);assert.ok(task2.audit.saved);assert.equal(checks.at(-1).stream,'task2');assert.equal(checks.at(-1).fields.find(field=>field.key==='hrtHours').value,4.8);
  await navigate('Alerts');assert.equal(await banner.count(),0);await panel.getByLabel('Automatic scenario checks',{exact:true}).waitFor();assert.match(await panel.getByLabel('Automatic scenario checks',{exact:true}).innerText(),/Task 2 scenario HRT-0163/);
  await navigate('AI & KPI reports');await page.getByRole('heading',{name:'Saved optimization results',exact:true}).waitFor();assert.equal(await page.locator('.rr-totals article').count(),4);assert.deepEqual(errors,[]);
  await writeFile(path.join(out,'verification.json'),JSON.stringify({passed:true,base,catalogHash:catalog.catalogHash,checks,layouts,browserErrors:errors,task1RunId:task1.runId,task2RunId:task2.runId},null,2));
  console.log('PASS: authenticated checks, notifications, counts, deduplication, acknowledgement, resolution, session restore, missing inputs, network failure, unit ambiguity, mobile layouts, automatic Task 1/Task 2 checks, unchanged model flows and reports');
}catch(error){await writeFile(path.join(out,'failure.txt'),String(error.stack));throw error;}
finally{await browser?.close();if(server?.exitCode===null){const exited=once(server,'exit');server.kill();await exited;}if(server)await writeFile(path.join(out,'server.log'),logs);}
