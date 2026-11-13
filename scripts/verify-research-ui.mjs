import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root=fileURLToPath(new URL("../",import.meta.url)),out=path.join(root,"test-results","hrt-research-ui");await mkdir(out,{recursive:true});
const password=randomUUID(),listener=createServer();listener.listen(0,"127.0.0.1");await once(listener,"listening");const port=listener.address().port;await new Promise(r=>listener.close(r));
const base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,windowsHide:true,env:{...process.env,VERCEL:"",BLOB_READ_WRITE_TOKEN:"",OPENAI_API_KEY:"",AQUA_AUDIT_DIR:path.join(out,"records-"+randomUUID()),AQUA_SESSION_SECRET:randomUUID(),AQUA_ADMIN_USERNAME:"admin",AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:"user",AQUA_USER_PASSWORD:password}});
let logs="",browser;server.stdout.on("data",v=>logs+=v);server.stderr.on("data",v=>logs+=v);
function numeric(text){return Number(text.replaceAll(",","").match(/-?\d+(?:\.\d+)?/)?.[0]);}
function csvRows(text){return text.replace(/^\uFEFF/,"").trim().split(/\r?\n/).map(line=>{const cells=[];let cell="",quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===","&&!quoted){cells.push(cell);cell="";}else cell+=c;}cells.push(cell);return cells;});}
try{
  let ready=false;for(let i=0;i<100;i++){assert.equal(server.exitCode,null,logs.slice(-2000));try{if((await fetch(base+"/api/auth/session")).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs.slice(-3000));
  browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[];
  let dayModelRequests=0,researchRequests=0;
  page.on("pageerror",e=>errors.push(e.message));page.on("request",request=>{if(request.method()==="POST"){const route=new URL(request.url()).pathname;if(route==="/api/predict")dayModelRequests++;if(route==="/api/research/hrt")researchRequests++;}});
  await page.goto(base);
  await page.getByLabel("Username",{exact:true}).fill("admin");await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:/Continue/}).click();
  const study=page.locator(".hr-workspace"),sidebar=page.locator(".simple-sidebar");
  await study.getByText("Research model ready",{exact:true}).waitFor();
  const runButton=()=>study.locator(".hr-header-actions").getByRole("button",{name:"Run AI optimization",exact:true});
  async function navigate(label,title){if(await page.evaluate(()=>innerWidth<=900)&&!(await sidebar.getAttribute("class"))?.includes("is-open"))await page.getByRole("button",{name:"Open navigation"}).click();await sidebar.getByRole("button",{name:label,exact:true}).click();if(title)assert.equal(await study.locator("h1").innerText(),title);}
  async function toggleSettings(open){const button=study.getByRole("button",{name:"Study settings",exact:true});if((await button.getAttribute("aria-expanded")==="true")!==open)await button.click();}
  async function runModel(){const pending=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/research/hrt"&&r.request().method()==="POST");await runButton().click();const response=await pending;assert.equal(response.status(),200);const current=await response.json();await study.locator(".hr-footer").filter({hasText:current.runId.slice(0,8)}).waitFor();return current;}
  async function assertProduction(current,keys=["biogasM3Day","methaneM3Day","electricityKwhDay"]){for(const key of keys){const shown=numeric(await study.locator(`.pd-kpi[data-metric="${key}"] strong`).innerText());assert.ok(Math.abs(shown-current.comparison[key])<=.051,`${key}: displayed ${shown}, calculated ${current.comparison[key]}`);}}
  async function assertDemo(current,failed=false){const demo=study.getByRole("region",{name:"Simulated comparison",exact:true});assert.equal(await demo.count(),1);assert.match(await demo.innerText(),/SIMULATED RESULTS/);assert.equal(await demo.getAttribute("data-source-run-id"),current.runId);assert.equal(await demo.getAttribute("data-reason"),failed?"run-failed":"presentation");const gain=Number(await demo.getAttribute('data-gain-pct')),days=await demo.getAttribute('data-period')==='year'?365:1;assert.ok(gain>=5&&gain<=10);for(const key of ["biogasM3Day","methaneM3Day","electricityKwhDay"]){const card=demo.locator(`[data-demo-metric="${key}"]`);assert.ok(Math.abs(numeric(await card.locator('[data-baseline-value]').innerText())-current.comparison[key]*days)<=.0051);assert.ok(Math.abs(numeric(await card.locator('[data-demo-value]').innerText())-current.comparison[key]*(1+gain/100)*days)<=.0051);}return demo;}
  async function assertRecommendation(current){const recommendations=study.getByRole("region",{name:"AI recommendations",exact:true});for(const item of current.recommendations){const text=await recommendations.locator(`[data-parameter="${item.key}"]`).innerText();assert.ok(text.includes(item.target.toLocaleString("en-US",{maximumFractionDigits:2})),`${item.key}: target missing from ${text}`);if(item.current!==null)assert.ok(text.includes(item.current.toLocaleString("en-US",{maximumFractionDigits:2})),`${item.key}: current value missing`);}return recommendations;}
  assert.equal(await study.getByLabel("Scenario mode",{exact:true}).count(),0,"Study settings start collapsed");
  await toggleSettings(true);assert.equal(await study.getByLabel("Scenario mode",{exact:true}).inputValue(),"paired");await study.getByLabel("Scenario mode",{exact:true}).selectOption("manual");assert.equal(await study.getByLabel("Scenario mode",{exact:true}).inputValue(),"manual");assert.equal(await study.getByLabel("Comparison HRT (hours)",{exact:true}).inputValue(),"24");assert.equal(await study.getByLabel("Research objective",{exact:true}).inputValue(),"maximum_energy");await toggleSettings(false);
  assert.equal(await page.getByRole("button",{name:"Day-scale reference",exact:true}).count(),0);
  assert.match(await study.locator(".hr-disclosure").innerText(),/not plant validated/);
  await navigate("Process monitor","Process Monitor");
  const emptyMonitor=study.locator(".rpm-workspace");
  assert.equal(await emptyMonitor.locator(".rpm-stage").count(),0,"No completed stages may appear before a backend run");
  assert.match(await emptyMonitor.locator(".rpm-pending").innerText(),/No execution trace yet/);
  assert.equal(await emptyMonitor.locator(".rpm-device-status").filter({hasText:"NOT CONNECTED"}).count(),4);
  const workflowButton=()=>emptyMonitor.locator(".rpm-trace").getByRole("button",{name:/Run(?:ning)? AI workflow/});
  const researchRoute="**/api/research/hrt";
  await page.route(researchRoute,route=>route.request().method()==="POST"?route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Workflow retry test"})}):route.continue());
  await workflowButton().click();await emptyMonitor.getByRole("alert").waitFor();
  assert.equal(await workflowButton().isEnabled(),true,"Failed workflow must be retryable");
  assert.equal(await emptyMonitor.locator(".rpm-stage").count(),0,"A failed request must never produce completed stages");
  assert.equal(await study.locator('.ic-demo').count(),0,"A failed first request has no verified baseline for a demo");
  await page.unroute(researchRoute);
  await page.route(researchRoute,async route=>{if(route.request().method()!=="POST")return route.continue();const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,5500));await route.fulfill({response});});
  const workflowRequestsBefore=researchRequests,workflowPending=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/research/hrt"&&r.request().method()==="POST");
  await workflowButton().click();
  await emptyMonitor.locator('.rpm-workflow-stage[data-state="active"]').first().waitFor();
  assert.equal(await emptyMonitor.locator(".rpm-workflow-stage").count(),8);
  assert.equal(await workflowButton().isDisabled(),true);assert.equal(await study.locator(".hr-header-actions .hr-primary").isDisabled(),true,"Other run controls stay disabled during playback");
  await workflowButton().evaluate(button=>{button.click();button.click();});
  await emptyMonitor.locator('.rpm-workflow-stage[data-state="active"]').filter({hasText:"Build reports"}).waitFor();
  assert.equal(await emptyMonitor.locator(".rpm-trace-footer").count(),0,"Animation must wait for the actual response before showing completion");
  await emptyMonitor.locator(".rpm-trace").screenshot({path:path.join(out,"workflow-running-1440.png")});
  const workflowResponse=await workflowPending;assert.equal(workflowResponse.status(),200);const workflowRun=await workflowResponse.json();
  await study.locator(".hr-footer").filter({hasText:workflowRun.runId.slice(0,8)}).waitFor();
  await emptyMonitor.locator(".rpm-trace-footer").waitFor();
  assert.equal(researchRequests,workflowRequestsBefore+1,"Workflow must submit exactly one backend run");
  assert.equal(workflowRun.audit.saved,true);assert.equal(await emptyMonitor.locator(".rpm-workflow-stage").count(),0);
  assert.equal(await emptyMonitor.locator(".rpm-stage").count(),8);
  assert.match(await emptyMonitor.locator(".rpm-stage-detail").innerText(),/COMPLETED STAGE 8/);
  assert.equal(await emptyMonitor.getByRole("alert").count(),0);
  await page.unroute(researchRoute);
  await navigate("Overview");
  assert.equal(workflowRun.scenario.mode,"manual");assert.equal(workflowRun.comparison.hrtHours,24);assert.equal(workflowRun.request.objective,"maximum_energy");assert.equal(workflowRun.jointImprovement.status,"IMPROVED");
  const defaultRuns=[workflowRun];
  for(let i=0;i<4;i++){
    const last=defaultRuns.at(-1),current=await runModel();
    assert.deepEqual(current.comparison,workflowRun.comparison,"Normal optimization must preserve its initial baseline");
    assert.equal(current.jointImprovement.status,"IMPROVED");
    await assertDemo(current);
    for(const [key,digits] of [["biogasM3Day",1],["methaneM3Day",1],["electricityKwhDay",2]]){
      assert.ok(current.selected[key]>current.comparison[key]+1/365,key);
      assert.notEqual(current.selected[key].toFixed(digits),current.comparison[key].toFixed(digits),"Before and after must be visibly different: "+key);
      assert.notEqual(current.selected[key].toFixed(digits),last.selected[key].toFixed(digits),"Repeat run must use a different eligible result: "+key);
    }
    defaultRuns.push(current);
  }
  for(const [label,metric,selectedMetric] of [["Biogas","biogasM3Day","aiBiogazVolume"],["Electricity","electricityKwhDay","aiElectricityKwhDay"]]){
    await navigate(label);
    const before=numeric(await study.locator(`.pd-kpi[data-metric="${metric}"] strong`).innerText());
    const after=numeric(await study.locator(`.pd-kpi[data-metric="${selectedMetric}"] strong`).innerText());
    assert.ok(after>before,`${label} must visibly improve in the normal default flow`);
    await study.locator(".pd-dashboard").screenshot({path:path.join(out,`default-before-after-${label.toLowerCase()}.png`)});
  }
  await writeFile(path.join(out,"default-before-after.json"),JSON.stringify(defaultRuns.map(r=>({runId:r.runId,comparison:r.comparison,selected:r.selected,outcome:r.jointImprovement.status})),null,2));
  await navigate("Overview");await toggleSettings(true);await study.getByLabel("Comparison HRT (hours)",{exact:true}).fill("2.5");
  const clientCase=await runModel();assert.equal(clientCase.jointImprovement.status,"NO_JOINT_IMPROVEMENT");assert.deepEqual(clientCase.selected,clientCase.comparison);await toggleSettings(false);
  await navigate("Biogas");const demo=await assertDemo(clientCase);await demo.screenshot({path:path.join(out,"client-2-5h-illustrative-demo.png")});await assertProduction(clientCase,["biogasM3Day"]);
  const evidence=await context.request.get(base+`/api/audit?runId=${clientCase.runId}`);const evidenceBody=await evidence.json();assert.equal(evidenceBody.integrity,true);assert.deepEqual(evidenceBody.record.response.selected,clientCase.comparison);assert.ok(!JSON.stringify(evidenceBody.record).includes("ILLUSTRATIVE_DEMO"),"Illustrative values must never become model audit evidence");
  await page.route(researchRoute,route=>route.request().method()==="POST"?route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Demonstration failure test"})}):route.continue());
  const failedPending=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/research/hrt"&&r.request().method()==="POST");await runButton().click();assert.equal((await failedPending).status(),503);await study.getByRole("alert").filter({hasText:"Demonstration failure test"}).waitFor();await assertDemo(clientCase,true);assert.ok((await study.locator('.hr-footer').innerText()).includes(clientCase.runId.slice(0,8)),"Failure must retain the last real run");
  await page.unroute(researchRoute);await navigate("Overview");await toggleSettings(true);await study.getByLabel("Comparison HRT (hours)",{exact:true}).fill("24");const recovered=await runModel();assert.equal(recovered.jointImprovement.status,"IMPROVED");await assertDemo(recovered);defaultRuns.push(recovered);
  await navigate("Overview");await toggleSettings(true);await study.getByLabel("Scenario mode",{exact:true}).selectOption("automatic");await study.getByLabel("Research objective",{exact:true}).selectOption("shortest_hrt");await toggleSettings(false);
  let previous=defaultRuns.at(-1).comparison.hrtHours,previousProduction;
  const automaticRuns=[],automaticResults=[];
  for(let i=0;i<3;i++){
    const current=await runModel();assert.equal(current.audit.saved,true);assert.equal(current.scenario.mode,"automatic");assert.ok(Math.abs(current.comparison.hrtHours-previous)>=1-1e-10);
    await assertProduction(current);
    const production=await study.locator('.pd-kpi[data-metric="biogasM3Day"] strong, .pd-kpi[data-metric="methaneM3Day"] strong, .pd-kpi[data-metric="electricityKwhDay"] strong').allTextContents();
    if(previousProduction)assert.notDeepEqual(production,previousProduction);assert.equal(await study.locator(".hr-stale").count(),0);
    automaticRuns.push({runId:current.runId,hrtHours:current.comparison.hrtHours,production});automaticResults.push(current);previous=current.comparison.hrtHours;previousProduction=production;
  }
  await page.screenshot({path:path.join(out,"automatic-scenario-1440.png"),fullPage:true});
  await toggleSettings(true);await study.getByLabel("Scenario mode",{exact:true}).selectOption("manual");assert.equal(await study.getByLabel("Comparison HRT (hours)",{exact:true}).inputValue(),"24");
  let run=await runModel();assert.equal(run.retentionTime.beforeHours,24);assert.equal(run.comparison.hrtHours,24);assert.equal(run.audit.saved,true);await assertProduction(run);await toggleSettings(false);
  for(let repeat=0;repeat<2;repeat++){
    const previous=run;run=await runModel();
    assert.equal(run.request.previousSelectedHrtHours,previous.selected.hrtHours,"Run button sends the previous selection without changing the controls");
    assert.deepEqual(run.comparison,previous.comparison,"Repeated optimization keeps the entered baseline fixed");
    assert.equal(run.candidateSelection.changedFromPrevious,true);
    for(const [key,digits] of [["biogasM3Day",1],["methaneM3Day",1],["electricityKwhDay",2]]){
      assert.ok(run.selected[key]>run.comparison[key]);assert.notEqual(run.selected[key].toFixed(digits),previous.selected[key].toFixed(digits));
    }
    await assertProduction(run);
  }
  const selectedText=run.selected.hrtHours.toLocaleString(undefined,{maximumFractionDigits:2});
  assert.equal(run.jointImprovement.status,"IMPROVED");
  assert.match(await study.locator(".pd-run-summary .hr-selected-time strong").innerText(),new RegExp(`${selectedText} hours`));
  const conditions=await assertRecommendation(run);assert.match(await conditions.locator('[data-parameter="hrtHours"]').innerText(),new RegExp(`24.*${selectedText}.*hours.*decrease`,"s"));
  await study.getByRole("button",{name:"Ask Copilot",exact:true}).click();const chat=study.getByRole("complementary",{name:"Hours-scale Copilot"});
  await chat.getByLabel("Ask about the hours-scale run").fill("Why this HRT?");await chat.getByRole("button",{name:"Ask Copilot",exact:true}).click();
  await chat.locator('.chat-messages .ai').filter({hasText:`The selected HRT is ${run.selected.hrtHours.toFixed(2)} hours`}).waitFor();
  const answer=await chat.locator('.chat-messages .ai').last().innerText();assert.doesNotMatch(answer,/\b(?:528|602)(?:\.0+)?\s*(?:hours|h)\b|\b22(?:\.0+)?\s*days\b/i);assert.ok(answer.includes(run.comparison.biogasM3Day.toFixed(2)),"Copilot must use current saved-run production");await chat.getByLabel("Close Copilot").click();
  assert.match(await study.locator(".pd-kpis").innerText(),/kWh\/day/);assert.match(await study.locator(".pd-kpis").innerText(),/m³ CH₄\/day/);assert.equal(await study.locator(".pd-chart .rc-comparison").count(),1);await page.screenshot({path:path.join(out,"overview-1440.png"),fullPage:true});
  for(const [label,title] of [["Biogas","Biogas Production Optimization Dashboard"],["Methane","Methane Yield Optimization Dashboard"],["Electricity","Electricity Production Dashboard"]]){
    await navigate(label,title);
    await assertProduction(run,label==="Biogas"?["biogasM3Day"]:label==="Electricity"?["electricityKwhDay"]:undefined);
    const metric=label==="Biogas"?"biogasM3Day":label==="Methane"?"methaneM3Day":"electricityKwhDay";
    const sharedBars=study.locator(`.pd-chart .eb-comparison[data-metric="${metric}"]`),simulationPanel=await assertDemo(run),simulatedGain=Number(await simulationPanel.getAttribute('data-gain-pct'));
    assert.equal(await sharedBars.getAttribute('data-period'),'year',`${label} opens on annual bars`);
    for(const [period,factor] of [['Day',1],['Month',30],['Year',365]]){
      await study.getByRole('button',{name:period,exact:true}).click();assert.equal(await sharedBars.getAttribute('data-source'),'simulated');
      assert.match(await sharedBars.innerText(),/SIMULATED RESULTS/);
      assert.ok(Math.abs(numeric(await sharedBars.locator('[data-value="current"]').innerText())-run.comparison[metric]*factor)<=.051);
      assert.ok(Math.abs(numeric(await sharedBars.locator('[data-value="selected"]').innerText())-run.comparison[metric]*(1+simulatedGain/100)*factor)<=.051);
      const barRatio=await sharedBars.evaluate(el=>parseFloat(el.querySelector('.eb-fill-selected').style.width)/parseFloat(el.querySelector('.eb-fill-baseline').style.width));
      assert.ok(Math.abs(barRatio-(1+simulatedGain/100))<1e-5,'Both bars use the same zero-based scale within browser CSS precision');
      await sharedBars.getByRole('button',{name:'Model results',exact:true}).click();assert.equal(await sharedBars.getAttribute('data-source'),'model');
      assert.ok(Math.abs(numeric(await sharedBars.locator('[data-value="selected"]').innerText())-run.selected[metric]*factor)<=.051,'Model view retains the actual saved prediction');
      await sharedBars.getByRole('button',{name:'Simulated comparison',exact:true}).click();
    }
    await sharedBars.screenshot({path:path.join(out,`${label.toLowerCase()}-bars-simulated-1440.png`)});
    const comparisonChart=study.locator(".pd-chart .rc-comparison");
    if(label!=="Electricity"){
      await study.getByRole('button',{name:'HRT curve',exact:true}).click();
      assert.equal(await comparisonChart.count(),1,`${label} uses the shared comparison chart`);
      assert.equal(await comparisonChart.locator(".rc-trajectory,.rc-baseline,.rc-current-marker,.rc-selected-marker").count(),4,`${label} shows fitted curve, baseline and both markers`);
      assert.match(await comparisonChart.innerText(),/Current vs AI-selected HRT/i);
      assert.match(await comparisonChart.locator(".rc-ai-callout").textContent(),/AI selected:/);
      assert.match(await comparisonChart.locator(".rc-time-callout").textContent(),/HRT decreases:/);
      await study.getByRole('button',{name:'Year',exact:true}).click();
    }
    if(label==="Biogas"){
      assert.ok(Math.abs(numeric(await study.locator('.pd-kpi[data-metric="methanePct"] strong').innerText())-run.comparison.methanePct)<=.051);
      const aiVolume=study.locator('.pd-kpi[data-metric="aiBiogazVolume"]');assert.match(await aiVolume.innerText(),/AI biogaz volume/);assert.ok(Math.abs(numeric(await aiVolume.locator('strong').innerText())-run.selected.biogasM3Day)<=.051);assert.match(await aiVolume.innerText(),/AI improvement: .*vs current/);
      await page.screenshot({path:path.join(out,"biogas-comparison-1440.png"),fullPage:true});
    }
    if(label==="Electricity"){
      await sharedBars.getByRole('button',{name:'Model results',exact:true}).click();
      for(const [key,value,unit] of [["electricityKwhDay",run.comparison.electricityKwhDay,"kWh/day"],["aiElectricityKwhDay",run.selected.electricityKwhDay,"kWh/day"],["currentAverageKw",run.comparison.electricityKwhDay/24,"kW"],["aiAverageKw",run.selected.electricityKwhDay/24,"kW"]]){
        const card=study.locator(`.pd-kpi[data-metric="${key}"]`),tolerance=key.endsWith("AverageKw")?.00006:.006;assert.ok(Math.abs(numeric(await card.locator("strong").innerText())-value)<=tolerance,`${key} must match the saved model run`);assert.match(await card.innerText(),new RegExp(unit.replace("/","\\/")));
      }
      assert.match(await study.locator(".pd-capacity-note").innerText(),/not the installed generator rating/);
      const barChart=study.locator('.pd-chart .eb-comparison[data-period="year"]');
      assert.equal(await barChart.count(),1,"Electricity opens on annual horizontal bars");
      assert.equal(await barChart.locator(".eb-fill-baseline,.eb-fill-selected").count(),2);
      assert.ok(Math.abs(numeric(await barChart.locator('[data-value="current"]').innerText())-run.comparison.electricityKwhDay*365)<=.051);
      assert.ok(Math.abs(numeric(await barChart.locator('[data-value="selected"]').innerText())-run.selected.electricityKwhDay*365)<=.051);
      await page.screenshot({path:path.join(out,"electricity-capacity-1440.png"),fullPage:true});
    }
    await assertRecommendation(run);assert.match(await study.locator(".hr-footer").innerText(),new RegExp(run.runId.slice(0,8)));
  }
  for(const [period,factor,unit] of [["Day",1,"kWh/day"],["Month",30,"kWh/month"],["Year",365,"kWh/year"]]){
    await study.getByRole("button",{name:period,exact:true}).click();const chart=study.locator(".pd-chart .eb-comparison");assert.equal(await chart.getAttribute("data-period"),period.toLowerCase());
    for(const [key,value] of [["current",run.comparison.electricityKwhDay],["selected",run.selected.electricityKwhDay]]){const text=await chart.locator(`[data-value="${key}"]`).innerText();assert.ok(Math.abs(numeric(text)-value*factor)<=.051,`${period} total must derive from the saved prediction`);assert.ok(text.includes(unit));}
    assert.equal(await chart.locator(".eb-fill-baseline,.eb-fill-selected").count(),2);assert.match(await chart.innerText(),/not measured plant history/);
  }
  await study.getByRole("button",{name:"HRT curve",exact:true}).click();await study.getByRole("img",{name:"Electricity model curve versus HRT in hours",exact:true}).waitFor();
  await navigate("HRT in hours","HRT in Hours");assert.match(await study.locator(".hr-comparison").innerText(),new RegExp(`24.*${selectedText}`,"s"));assert.match(await study.locator(".hr-coverage").innerText(),/2–24 hours/);assert.equal(await study.locator(".rc-comparison").count(),1);
  await navigate("AI optimizer","Recommended Operating Action");const recommendations=await assertRecommendation(run);assert.match(await recommendations.locator('[data-parameter="hrtHours"]').innerText(),new RegExp(`24 hours.*${selectedText} hours.*decrease`,"s"));
  assert.ok(Math.abs(numeric(await study.locator(".pd-optimizer-summary strong").innerText())-run.selected.biogasM3Day)<=.051);assert.ok(await study.getByRole("button",{name:"Use as comparison",exact:true}).isEnabled());
  await study.getByRole("button",{name:"Use as comparison",exact:true}).click();
  const copiedHrt=study.getByLabel("Comparison HRT (hours)",{exact:true});
  assert.equal(Number(await copiedHrt.inputValue()),run.selected.hrtHours,"Use as comparison must preserve the full model precision");
  assert.equal(await copiedHrt.evaluate(input=>input.validity.stepMismatch),false,"The exact model HRT must pass native form validation");
  const copiedPending=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/research/hrt"&&r.request().method()==="POST");
  await study.locator(".hr-controls").getByRole("button",{name:"Run AI optimization",exact:true}).click();
  const copiedResponse=await copiedPending;assert.equal(copiedResponse.status(),200);const copiedRun=await copiedResponse.json();
  assert.equal(copiedRun.retentionTime.beforeHours,run.selected.hrtHours);
  // A rotated alternative can still improve when used as the next fixed baseline.
  // Only copying the global optimum necessarily retains the same operating point.
  if(copiedRun.jointImprovement.status==="IMPROVED"){
    for(const key of ["biogasM3Day","methaneM3Day","electricityKwhDay"])assert.ok(Math.round(copiedRun.selected[key]*365)>Math.round(copiedRun.comparison[key]*365));
  }else{assert.equal(copiedRun.retentionTime.direction,"unchanged");assert.deepEqual(copiedRun.selected,copiedRun.comparison);}
  await study.locator(".hr-footer").filter({hasText:copiedRun.runId.slice(0,8)}).waitFor();
  await copiedHrt.fill("24");run=await runModel();await toggleSettings(false);
  await navigate("Workbook AI reading","Workbook AI Reading");await study.getByRole("cell",{name:"RUN-H001",exact:true}).waitFor();await study.getByRole("button",{name:"Next",exact:true}).click();await study.getByRole("cell",{name:"RUN-H021",exact:true}).waitFor();assert.match(await study.locator(".hr-evaluation").innerText(),/100 held-out test rows/);await page.screenshot({path:path.join(out,"workbook-1440.png"),fullPage:true});
  await navigate("Process monitor","Process Monitor");
  const monitor=study.locator(".rpm-workspace");await monitor.waitFor();assert.match(await monitor.innerText(),/not connected/i);assert.equal(await monitor.locator(".rpm-device-status").count(),4);assert.equal(await monitor.locator(".rpm-stage").count(),8);assert.equal(await monitor.locator(".rpm-backend-events li").count(),run.trace.length);
  for(const [label,key,tolerance] of [["HRT","hrtHours",.0051],["Temperature","temperature",.051],["pH","ph",.0051],["Organic loading","olr",.0051],["Feed rate","feedRate",.051]]){
    const row=monitor.locator(".rpm-conditions tbody tr").filter({has:page.getByRole("rowheader",{name:label,exact:true})}),cells=row.locator("td");
    assert.ok(Math.abs(numeric(await cells.nth(0).innerText())-run.comparison[key])<=tolerance,`${label}: Process Monitor must show the current scenario`);
    assert.ok(Math.abs(numeric(await cells.nth(1).innerText())-run.selected[key])<=tolerance,`${label}: Process Monitor must show the AI selected scenario`);
  }
  assert.ok(Math.abs(numeric(await monitor.locator(".rpm-index-ring strong").innerText())-run.comparison.stabilityPct)<=.051);
  assert.match(await monitor.locator(".rpm-stability").innerText(),/not a calibrated safety rating or prediction confidence/);
  await monitor.locator(".rpm-stage").nth(2).click();assert.match(await monitor.locator(".rpm-stage-detail").innerText(),/fitted/i);await monitor.locator("summary").click();assert.ok((await monitor.innerText()).includes(run.runId));await monitor.locator("summary").click();await page.screenshot({path:path.join(out,"process-monitor-1440.png"),fullPage:true});
  await navigate("AI & KPI reports","Saved Optimization Results");const reports=study.locator(".rr-workspace");
  async function assertReportTotals(current){const expected=[current.comparison.methaneM3Day*365,current.selected.methaneM3Day*365,current.comparison.electricityKwhDay*365,current.selected.electricityKwhDay*365];const totals=reports.locator(".rr-totals strong");assert.equal(await totals.count(),4);for(let i=0;i<4;i++)assert.ok(Math.abs(numeric(await totals.nth(i).innerText())-expected[i])<=.51);}
  await assertReportTotals(run);assert.equal(await reports.locator(".rr-improvement").getAttribute("data-outcome"),"IMPROVED");assert.ok((await reports.locator(".rr-improvement dd").allTextContents()).every(text=>text.startsWith("+")));assert.equal(await reports.locator(".rr-table-panel tbody tr").count(),12);assert.match(await reports.locator(".rr-projection-note").innerText(),/Constant-output projections, not measured history/);
  const downloads={};
  for(const [kind,label,count] of [["daily","Export daily projection",366],["monthly","Export 12-month projection",13]]){const pending=page.waitForEvent("download");await reports.getByRole("button",{name:label,exact:true}).click();const download=await pending;const file=await download.path();assert.ok(file);const csv=await readFile(file,"utf8");await writeFile(path.join(out,`${kind}-projection.csv`),csv);const rows=csvRows(csv);assert.equal(rows.length,count);assert.ok(rows.slice(1).every(row=>row.includes(run.runId)&&row.includes("client_calculated_projection_not_a_server_authenticated_export")));downloads[kind]=rows;}
  assert.equal(downloads.monthly.slice(1).reduce((sum,row)=>sum+Number(row[1]),0),365);for(const [i,key] of ["biogasM3Day","methaneM3Day","electricityKwhDay"].entries()){for(const rows of [downloads.monthly,downloads.daily]){assert.ok(Math.abs(rows.slice(1).reduce((sum,row)=>sum+Number(row[20+i]),0)-(run.selected[key]-run.comparison[key])*365)<1e-7);assert.ok(rows.slice(1).every(row=>Math.abs(Number(row[23+i])-(run.selected[key]/run.comparison[key]-1)*100)<1e-7));}}
  for(const index of [2,3,4,5,6,7])assert.ok(Math.abs(downloads.daily.slice(1).reduce((sum,row)=>sum+Number(row[index]),0)-downloads.monthly.slice(1).reduce((sum,row)=>sum+Number(row[index]),0))<1e-7,"Daily and monthly projections must reconcile");
  assert.ok(Math.abs(downloads.monthly.slice(1).reduce((sum,row)=>sum+Number(row[5]),0)-run.selected.methaneM3Day*365)<1e-7);
  const older=automaticResults[0];await reports.locator(".rr-history-select").filter({hasText:older.runId.slice(0,8)}).click();await reports.locator(".rr-history-notice").waitFor();await assertReportTotals(older);assert.equal(await study.locator(".pd-run-summary").count(),0);assert.equal(await reports.locator(".rr-improvement").getAttribute("data-outcome"),older.jointImprovement.status);await reports.getByRole("button",{name:"Return to latest run",exact:true}).click();await assertReportTotals(run);
  await reports.getByRole("button",{name:"Verify saved run",exact:true}).click();await reports.getByText("PASS · 9/9 checks",{exact:true}).waitFor();await page.screenshot({path:path.join(out,"reports-1440.png"),fullPage:true});
  const csv=await context.request.get(base+`/api/research/hrt?runId=${run.runId}&format=csv`);assert.equal(csv.status(),200);assert.equal((await csv.text()).trim().split(/\r?\n/).length,2001);
  await reports.getByRole("button",{name:"Open in Audit Trail",exact:true}).click();await page.getByRole("heading",{name:"Hours-scale research evidence",exact:true}).waitFor();const auditSummary=await page.locator(".hr-audit-summary").innerText();assert.ok(Math.abs(Number(auditSummary.match(/→ ([\d.]+) hours/)[1])-run.selected.hrtHours)<.0005);
  await page.getByRole("button",{name:"Verify HRT research replay",exact:true}).click();await page.locator(".hr-audit-summary").getByText("PASS: 9/9 checks.",{exact:true}).waitFor();await page.screenshot({path:path.join(out,"audit-1440.png"),fullPage:true});
  await page.getByRole("button",{name:"Hours-scale research",exact:true}).click();await study.getByRole("button",{name:"Open alerts",exact:true}).click();assert.equal(await study.locator("h1").innerText(),"Alerts & Model Coverage");
  await study.getByRole("heading",{name:"Supported HRT coverage: 2–24 hours",exact:true}).waitFor();assert.match(await study.locator(".pd-alert-list").innerText(),/calibrated prediction intervals are unavailable/);
  await navigate("Settings","Scenario Settings");assert.equal(await study.getByLabel("Scenario mode",{exact:true}).inputValue(),"manual");
  await study.getByLabel("Comparison HRT (hours)",{exact:true}).fill("528");const beforeInvalid=researchRequests;await runButton().click();await study.getByRole("alert").filter({hasText:"Comparison HRT must be between 2 and 24 hours"}).waitFor();assert.equal(researchRequests,beforeInvalid);assert.equal(await study.getByLabel("Comparison HRT (hours)",{exact:true}).evaluate(input=>input.validity.rangeOverflow),true);
  await study.getByLabel("Comparison HRT (hours)",{exact:true}).fill("20.6");await study.getByLabel("Research objective",{exact:true}).selectOption("target_hrt");await study.getByLabel("Target HRT (hours)",{exact:true}).fill("2");assert.ok(await study.locator(".hr-stale").isVisible());
  const target=await runModel();assert.equal(target.jointImprovement.status,"NO_JOINT_IMPROVEMENT");assert.deepEqual(target.selected,target.comparison);
  await navigate("Biogas","Biogas Production Optimization Dashboard");const unchangedVolume=study.locator('.pd-kpi[data-metric="aiBiogazVolume"]');assert.ok(Math.abs(numeric(await unchangedVolume.locator('strong').innerText())-target.comparison.biogasM3Day)<=.051);assert.match(await unchangedVolume.innerText(),/AI improvement: 0 m³\/day/);await study.getByRole('button',{name:'HRT curve',exact:true}).click();const unchangedChart=study.locator('.rc-comparison[data-outcome="no-improvement"]');assert.equal(await unchangedChart.count(),1);assert.equal(await unchangedChart.locator('.rc-selected-marker,.rc-change-arrow,.rc-ai-callout,.rc-time-callout').count(),0);assert.match(await unchangedChart.locator('.rc-retained-callout').textContent(),/Current retained:/);assert.match(await unchangedChart.innerText(),/No joint production gain/);await page.screenshot({path:path.join(out,"biogas-no-improvement-1440.png"),fullPage:true});
  await navigate("Electricity","Electricity Production Dashboard");assert.match(await study.locator('.pd-kpi[data-metric="aiElectricityKwhDay"]').innerText(),/AI improvement: 0 kWh\/day/i);assert.ok(Math.abs(numeric(await study.locator('.pd-kpi[data-metric="aiAverageKw"] strong').innerText())-target.comparison.electricityKwhDay/24)<=.051);await study.locator('.eb-comparison').getByRole('button',{name:'Model results',exact:true}).click();assert.equal(await study.locator('.eb-comparison[data-outcome="no-improvement"][data-period="year"]').count(),1);assert.equal(await study.locator('.eb-fill-baseline,.eb-fill-selected').count(),2);
  await navigate("AI & KPI reports","Saved Optimization Results");await assertReportTotals(target);assert.match(await reports.innerText(),/Current scenario retained/);assert.match(await reports.innerText(),/Yearly AI optimized methane/i);assert.match(await reports.innerText(),/Yearly AI optimized electricity/i);assert.deepEqual(await reports.locator(".rr-improvement dd").allTextContents(),["0%","0%","0%"]);assert.doesNotMatch(await reports.locator(".rr-totals,.rr-table-panel thead,.rr-history").allTextContents().then(text=>text.join(" ")),/no improvement/i);await page.screenshot({path:path.join(out,"no-joint-improvement-report-1440.png"),fullPage:true});
  await assertDemo(target);const demoDownloadPending=page.waitForEvent("download");await reports.getByRole("button",{name:"Export 12-month projection",exact:true}).click();const demoDownload=await demoDownloadPending;const actualCsv=csvRows(await readFile(await demoDownload.path(),"utf8"));assert.ok(Math.abs(actualCsv.slice(1).reduce((sum,row)=>sum+Number(row[5]),0)-target.selected.methaneM3Day*365)<1e-7,"Exports must retain actual model totals when the demo is visible");
  await navigate("AI optimizer","Recommended Operating Action");await study.getByText("AI improvement: 0%. Current scenario retained.",{exact:false}).first().waitFor();assert.match(await study.getByRole("region",{name:"AI recommendations",exact:true}).locator('[data-parameter="hrtHours"]').innerText(),/20.6 hours.*20.6 hours/s);
  await navigate("Alerts","Alerts & Model Coverage");await study.getByRole("heading",{name:"AI improvement: 0%",exact:true}).waitFor();
  await navigate("Settings","Scenario Settings");await study.getByLabel("Comparison HRT (hours)",{exact:true}).fill("2");await study.getByLabel("Target HRT (hours)",{exact:true}).fill("12");
  const noImprovement=await runModel();assert.equal(noImprovement.jointImprovement.status,"NO_JOINT_IMPROVEMENT");assert.equal(noImprovement.retentionTime.direction,"unchanged");await navigate("AI optimizer","Recommended Operating Action");await study.locator('.pd-run-summary .hr-time-change[data-direction="unchanged"]').waitFor();assert.match(await study.getByRole("region",{name:"AI recommendations",exact:true}).locator('[data-parameter="hrtHours"]').innerText(),/0 hours \(unchanged\)/);
  const widths=[];
  for(const width of [1920,1440,1366,1280,1024,850,768,390]){
    await page.setViewportSize({width,height:1000});
    for(const view of ["Overview","Biogas","Methane","Electricity","Workbook AI reading","Process monitor","AI optimizer","AI & KPI reports","Alerts","Settings","Data sources"]){await navigate(view);const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+1,JSON.stringify({view,...size}));}
    await navigate("Overview");await page.screenshot({path:path.join(out,`research-${width}.png`),fullPage:true});widths.push(width);
  }
  await navigate("Audit Trail");await page.getByRole("button",{name:"1. Scenario execution",exact:true}).click();assert.match(await page.locator('.at-notice').first().innerText(),/Original day-scale model tests remain here/);
  await page.getByRole("button",{name:"Open navigation"}).click();await sidebar.getByRole("button",{name:"Hours-scale research",exact:true}).click();assert.match(await study.locator(".pd-run-summary .hr-selected-time strong").innerText(),/2 hours/);
  assert.equal(dayModelRequests,0,"Dashboard navigation must not execute the original day-scale prediction route");assert.deepEqual(errors,[]);
  const summary={status:"PASS",checkedAt:new Date().toISOString(),widths,automaticRuns,checks:["each automatic click changes the HRT input and displayed fitted predictions","shared results across restored production dashboards and Copilot","comparison HRT limited to 2–24 hours","joint improvement or explicit no-improvement outcome","manual controls and stale-result state","Day/Month/Year projections use saved predictions","Process Monitor displays the current run and disconnected hardware","source pagination and synthetic evaluation disclosure","Reports monthly/daily CSV reconciliation, saved history and replay","Alerts include no-improvement and unavailable uncertainty","2000-point export and saved record retrieval","original day models remain in Audit Trail","all restored views fit phone, tablet and desktop without page overflow"],runId:run.runId,selectedHrtHours:run.selected.hrtHours,scope:"Local software verification with synthetic inputs; not plant validation"};
  await writeFile(path.join(out,"summary.json"),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
}finally{if(browser)await browser.close();if(server.exitCode===null){const stopped=once(server,"exit");server.kill();await stopped;}await writeFile(path.join(out,"server.log"),logs);}
