import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const remote=process.env.AQUA_UI_BASE_URL,out=path.resolve('test-results/audit-models-'+(remote?'live':'local'));
await mkdir(out,{recursive:true});
const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
const base=remote||`http://127.0.0.1:${port}`,password=remote?process.env.AQUA_UI_PASSWORD:randomUUID();if(!password)throw new Error('Set AQUA_UI_PASSWORD');
const server=remote?null:spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{windowsHide:true,env:{...process.env,VERCEL:'',BLOB_READ_WRITE_TOKEN:'',AQUA_AUDIT_DIR:path.join(out,'records-'+randomUUID()),AQUA_SESSION_SECRET:randomUUID(),AQUA_ADMIN_USERNAME:'admin',AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:'user',AQUA_USER_PASSWORD:password}});
let browser;const checks=[],records=[],errors=[];
function pass(name){checks.push(name);console.log('PASS: '+name);}
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/auth/session')).status===401)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 async function login(){await page.goto(base);await page.getByLabel('Username',{exact:true}).fill('admin');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Continue →'}).click();await page.locator('.simple-sidebar').waitFor();}
 async function nav(name){await page.locator('.simple-sidebar').getByRole('button',{name,exact:true}).click();}
 async function clickRequest(locator,endpoint,status=200){const wait=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()==='POST');await locator.click();const r=await wait;assert.equal(r.status(),status,await r.text());return r.json();}
 const button=name=>page.getByRole('button',{name,exact:true});
 await login();await nav('Audit Trail');const ml=page.getByRole('region',{name:'Trained ML predictions',exact:true});await ml.getByText('LOADED',{exact:true}).waitFor();
 const predictions=[];
 for(let i=0;i<3;i++){
  const run=await clickRequest(ml.getByRole('button',{name:'Run ML prediction',exact:true}),'/api/ml/predict');assert.equal(run.audit.saved,true);assert.equal(run.predictions.length,2);assert.deepEqual(run.predictions.map(p=>p.modelId).sort(),['gradient_boosting','ridge']);
  for(const p of run.predictions){assert.ok(Object.values(p.raw).every(Number.isFinite));assert.match(p.artifactHash,/^sha256:/);}
  predictions.push(run.predictions.map(p=>({id:p.modelId,raw:p.raw,artifact:p.artifactHash})));records.push({id:run.runId,kind:'ml_prediction'});
 }
 assert.deepEqual(predictions[0],predictions[1]);assert.deepEqual(predictions[1],predictions[2]);pass('Gradient Boosting and Ridge execute identically across three identical UI requests');
 const mlVerify=await clickRequest(ml.getByRole('button',{name:'Verify ML run',exact:true}),'/api/ml/verify');assert.equal(mlVerify.status,'PASS');assert.equal(mlVerify.checks.length,11);assert.ok(mlVerify.checks.every(c=>c.status==='PASS'));records.push({id:mlVerify.reportId,kind:'ml_verification'});pass('All 11 trained-model verification checks pass through Audit Trail');
 await clickRequest(ml.getByRole('button',{name:'Test null rejection',exact:true}),'/api/ml/predict',422);pass('ML null pH rejection returns HTTP 422');
 await page.screenshot({path:path.join(out,'01-ml-audit.png'),fullPage:true});
 await button('1. Scenario execution').click();const scenario=await clickRequest(button('Run test 1'),'/api/predict');assert.equal(scenario.audit.saved,true);records.push({id:scenario.runId,kind:'optimization'});
 await button('Continue to test 2').click();const scenarioVerify=await clickRequest(button('Run test 2'),'/api/audit/tests');assert.equal(scenarioVerify.status,'PASS');assert.equal(scenarioVerify.checks.length,9);assert.ok(scenarioVerify.checks.every(c=>c.status==='PASS'));records.push({id:scenarioVerify.reportId,kind:'verification'});pass('Original scenario engine executes and all nine verification checks pass');
 await button('HRT Optimization model - Reactor Technologies').click();const reactor=page.getByRole('region',{name:'HRT Optimization model - Reactor Technologies'});await reactor.getByLabel('Calculation method',{exact:true}).selectOption('model');
 const hrt=await clickRequest(reactor.getByRole('button',{name:'Run HRT optimization',exact:true}),'/api/research/reactor-search');assert.equal(hrt.audit.saved,true);assert.equal(hrt.candidateCount,2000);records.push({id:hrt.runId,kind:'reactor_search'});
 const hrtWait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/research/reactor-search'&&r.url().includes('verify=true'));await reactor.getByRole('button',{name:'Verify saved run',exact:true}).click();const hrtVerification=await (await hrtWait).json();assert.equal(hrtVerification.status,'PASS');pass('Reactor Ridge model executes 2,000 candidates and verifies from the Audit Trail tab');
 await page.screenshot({path:path.join(out,'02-hrt-audit.png'),fullPage:true});
 await nav('Overview');const production=await clickRequest(page.locator('.hr-header-actions').getByRole('button',{name:'Run AI optimization',exact:true}),'/api/research/hrt');assert.equal(production.audit.saved,true);assert.equal(production.candidateCount,2000);assert.ok(production.pairedComparison.sameTank);records.push({id:production.runId,kind:'hrt_research'});
 await nav('Audit Trail');await button('Audit records').click();
 async function retrieve(id){await page.getByLabel('Run or verification report ID',{exact:true}).fill(id);const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/audit'&&new URL(r.url()).searchParams.get('runId')===id);await button('Retrieve').click();const r=await wait;assert.equal(r.status(),200);const record=await r.json();assert.equal(record.integrity,true);await page.locator('.at-opened > code').filter({hasText:id}).waitFor();return record;}
 await retrieve(production.runId);const verifyButton=page.locator('.hr-audit-summary').getByRole('button',{name:/Verify/});const prodVerification=await clickRequest(verifyButton,'/api/research/hrt/verify');assert.equal(prodVerification.status,'PASS');pass('Current same-tank production model retrieves and verifies inside Audit Trail');
 await page.screenshot({path:path.join(out,'03-same-tank-audit.png'),fullPage:true});
 let listed=await page.locator('.at-link').allTextContents();for(let i=0;i<5&&records.some(r=>!listed.includes(r.id));i++){await button('Load more records').click();await page.waitForFunction(()=>![...document.querySelectorAll('button')].some(b=>b.textContent==='Loading...'));listed=await page.locator('.at-link').allTextContents();}
 assert.ok(records.every(r=>listed.includes(r.id)));assert.equal(new Set(listed).size,listed.length);pass('All new model and verification IDs appear in the visible audit list without duplicates');
 const downloaded=await page.request.get(base+'/api/audit?runId='+production.runId+'&format=json');assert.equal(downloaded.status(),200);const envelope=await downloaded.json();assert.equal(envelope.integrity,true);assert.equal(envelope.authentication.independentlyVerifiable,false);pass('Server-authenticated evidence export is retrievable');
 const logout=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/logout');await page.locator('.side-logout').click();await logout;await login();await nav('Audit Trail');await button('Audit records').click();
 for(const record of records){const saved=await retrieve(record.id);assert.equal(saved.record.id,record.id);assert.equal(saved.record.kind,record.kind);}
 pass('All tested model and verification records retrieve with valid integrity after a fresh login');
 await retrieve(hrt.runId);await page.screenshot({path:path.join(out,'04-restored-audit.png'),fullPage:true});
 assert.deepEqual(errors,[]);pass('No browser runtime errors');
 await writeFile(path.join(out,'result.json'),JSON.stringify({passed:true,base,checkedAt:new Date().toISOString(),checks,records,mlOutputs:predictions[0],mlVerification:mlVerify,scenarioVerification:scenarioVerify,hrtVerification,productionVerification:prodVerification,scope:'Execution and evidence verification; not predictive-accuracy or measured-plant validation.'},null,2));
}catch(error){await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error),checks,records,errors},null,2));throw error;}finally{await browser?.close();server?.kill();}
