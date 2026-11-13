import assert from "node:assert/strict";
import test from "node:test";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {createServer} from "node:net";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {randomUUID} from "node:crypto";

const root=fileURLToPath(new URL("../",import.meta.url));
const storage=path.join(root,".audit-test-data","research-"+randomUUID());
const request={baseline:{value:22,unit:"days"},objective:"shortest_hrt",retainedMethanePct:90,targetHours:12};
test("hours research uses a fitted model, explicit units and durable evidence",{timeout:120000},async t=>{
  await mkdir(storage,{recursive:true});
  const listener=createServer();listener.listen(0,"127.0.0.1");await once(listener,"listening");const port=listener.address().port;await new Promise(r=>listener.close(r));
  const base=`http://127.0.0.1:${port}`,password=randomUUID();
  const server=spawn(process.execPath,[path.join(root,"node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",String(port)],{cwd:root,windowsHide:true,env:{...process.env,VERCEL:"",BLOB_READ_WRITE_TOKEN:"",AQUA_AUDIT_DIR:storage,AQUA_SESSION_SECRET:randomUUID(),AQUA_ADMIN_USERNAME:"admin",AQUA_ADMIN_PASSWORD:password,AQUA_USER_USERNAME:"user",AQUA_USER_PASSWORD:password}});
  let logs="";server.stdout.on("data",v=>logs+=v);server.stderr.on("data",v=>logs+=v);
  t.after(async()=>{if(server.exitCode===null){const ended=once(server,"exit");server.kill();await ended;}});
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+"/api/auth/session")).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs.slice(-3000));
  async function login(username){const r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});assert.equal(r.status,200);return r.headers.get("set-cookie").split(";")[0];}
  let cookie=await login("admin");const userCookie=await login("user");
  async function call(url,body,auth=cookie){const response=await fetch(base+url,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...(auth?{Cookie:auth}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
  let run;
  await t.test("auth, role boundaries and strict unit contract",async()=>{
    assert.equal((await call("/api/research/hrt",undefined,"")).status,401);
    assert.equal((await call("/api/research/hrt",request,"")).status,401);
    assert.equal((await call("/api/research/hrt",request,userCookie)).status,403);
    for(const payload of [null,{}, {...request,baseline:null},{...request,baseline:{value:null,unit:"days"}},{...request,baseline:{value:22,unit:"weeks"}},{...request,targetHours:1.99},{...request,targetHours:24.01},{...request,retainedMethanePct:0},{...request,objective:"force_reduction"},{...request,unknown:true},{...request,baseline:{...request.baseline,unknown:1}}])assert.equal((await call("/api/research/hrt",payload)).status,422,JSON.stringify(payload));
    const malformed=await fetch(base+"/api/research/hrt",{method:"POST",headers:{Cookie:cookie,"Content-Type":"application/json"},body:"{"});assert.equal(malformed.status,400);
  });
  await t.test("model, source rows, split disclosure and coefficient parity",async()=>{
    const meta=(await call("/api/research/hrt")).data;assert.equal(meta.fitRows,500);assert.equal(meta.assumptions.plantValidated,false);assert.equal(meta.input.min,2);assert.equal(meta.input.max,24);
    assert.equal(meta.evaluation.displaySummary.trainRows,380);assert.equal(meta.evaluation.displaySummary.testRows,100);
    const source=(await call("/api/research/hrt?view=data")).data;assert.equal(source.rows.length,500);assert.equal(source.rows[0].sourceRow,6);assert.equal(source.rows.at(-1).sourceRow,505);
    const response=await call("/api/research/hrt",request);assert.equal(response.status,200);run=response.data;
    assert.equal(run.audit.saved,true);assert.equal(run.candidates.length,2000);assert.equal(run.mode,"HOURS_RESEARCH");assert.equal(run.validationStatus,"SYNTHETIC AGREEMENT ONLY");
    const fixture=JSON.parse(await readFile(path.join(root,"ai-workflow/research/hours-parity.json"),"utf8"));
    for(const example of fixture.cases){const prediction=await call("/api/research/hrt",{...request,objective:"target_hrt",targetHours:example.hrtHours});assert.equal(prediction.status,200);const point=prediction.data.selected;for(const [key,value] of Object.entries(example.expected))assert.ok(Math.abs(point[key]-value)<fixture.tolerance,`${key} at ${point.hrtHours}`);}
    assert.equal(run.uncertainty.predictionInterval,null);
  });
  await t.test("selection is the shortest feasible point and production units reconcile",async()=>{
    assert.equal(run.retentionTime.beforeHours,528);assert.ok(run.selected.hrtHours>7&&run.selected.hrtHours<9);assert.equal(run.retentionTime.direction,"decrease");
    assert.ok(run.goal.satisfied);assert.ok(run.goal.selectedRetainedPct>=90-1e-9);
    assert.ok(run.candidates.filter(p=>p.hrtHours<run.selected.hrtHours).every(p=>p.methaneM3Day<run.goal.minimumMethaneM3Day));
    assert.equal(run.selected.methaneM3Day,run.selected.biogasM3Day*run.selected.methanePct/100);
    assert.equal(run.selected.electricityKwhDay,run.selected.methaneM3Day*9.97*.36);
    const hourly=(await call("/api/research/hrt",{...request,baseline:{value:528,unit:"hours"}})).data;assert.deepEqual(hourly.selected,run.selected);assert.deepEqual(hourly.retentionTime,run.retentionTime);
    const increase=(await call("/api/research/hrt",{...request,baseline:{value:1,unit:"hours"}})).data;assert.equal(increase.retentionTime.direction,"increase");assert.ok(increase.retentionTime.changeHours>0);
    const low=(await call("/api/research/hrt",{...request,objective:"target_hrt",targetHours:2})).data;assert.equal(low.selected.hrtHours,2);assert.equal(low.goal.satisfied,false);assert.ok(low.selected.methaneM3Day<run.selected.methaneM3Day);
    const replay=(await call("/api/research/hrt",request)).data;assert.notEqual(replay.runId,run.runId);assert.equal(replay.outputHash,run.outputHash);
  });
  await t.test("hours dashboard recommendations, comparison and Copilot share the saved model result",async()=>{
    const meta=(await call("/api/research/hrt")).data;
    assert.deepEqual(meta.defaults.baseline,{value:24,unit:"hours"});
    const current=(await call("/api/research/hrt",meta.defaults)).data;
    assert.equal(current.retentionTime.beforeHours,24);assert.equal(current.comparison.hrtHours,24);
    assert.ok(current.selected.hrtHours>=2&&current.selected.hrtHours<=24);
    assert.equal(current.jointImprovement.status,"IMPROVED");
    assert.ok(Math.round(current.selected.biogasM3Day*365)>Math.round(current.comparison.biogasM3Day*365));
    assert.ok(Math.round(current.selected.methaneM3Day*365)>Math.round(current.comparison.methaneM3Day*365));
    assert.ok(Math.round(current.selected.electricityKwhDay*365)>Math.round(current.comparison.electricityKwhDay*365));
    for(const item of current.recommendations){
      assert.equal(item.target,current.selected[item.key]);assert.equal(item.current,current.comparison[item.key]);
      assert.equal(item.change,item.target-item.current);
    }
    const hrt=current.recommendations.find(item=>item.key==="hrtHours");assert.equal(hrt.unit,"hours");assert.equal(hrt.current,24);
    const baseline=(await call("/api/research/hrt",{...meta.defaults,objective:"target_hrt",targetHours:24})).data;
    assert.deepEqual(current.comparison,baseline.selected);
    assert.equal(baseline.jointImprovement.status,"NO_JOINT_IMPROVEMENT");
    const reported=(await call("/api/research/hrt",{...meta.defaults,baseline:{value:20.6,unit:"hours"},objective:"target_hrt",targetHours:2})).data;
    assert.equal(reported.jointImprovement.status,"NO_JOINT_IMPROVEMENT");
    assert.deepEqual(reported.selected,reported.comparison);
    assert.equal(reported.retentionTime.direction,"unchanged");
    assert.equal(reported.selected.methaneM3Day*365,reported.comparison.methaneM3Day*365);
    assert.equal(reported.selected.electricityKwhDay*365,reported.comparison.electricityKwhDay*365);
    const noImprovementVerification=await call("/api/research/hrt/verify",{runId:reported.runId});assert.equal(noImprovementVerification.data.status,"PASS");
    const restored=(await call(`/api/research/hrt?runId=${current.runId}`)).data;assert.deepEqual(restored.recommendations,current.recommendations);
    const verified=await call("/api/research/hrt/verify",{runId:current.runId});assert.equal(verified.data.status,"PASS");
    const copilot=await call("/api/copilot",{question:"Why this HRT?",mode:"HOURS_RESEARCH",researchRunId:current.runId,prediction:{bestSetpoints:{hrt:602}}});
    assert.equal(copilot.status,200);assert.equal(copilot.data.runId,current.runId);
    assert.ok(copilot.data.answer.includes(`${current.selected.hrtHours.toFixed(2)} hours`));assert.doesNotMatch(copilot.data.answer,/602|days/);
    assert.equal((await call("/api/copilot",{question:"HRT?",mode:"HOURS_RESEARCH",researchRunId:current.runId},userCookie)).status,403);
    assert.equal((await call("/api/copilot",{question:"HRT?",mode:"HOURS_RESEARCH",researchRunId:"invalid"})).status,400);
    // A historical day-based comparison remains explicit and never becomes a fake hours baseline.
    assert.equal(run.retentionTime.beforeHours,528);assert.equal(run.comparison,null);
    assert.equal(run.recommendations.find(item=>item.key==="temperature").current,null);
  });
  await t.test("saved evidence, replay, CSV and fresh-session listing agree",async()=>{
    const saved=(await call(`/api/audit?runId=${run.runId}`)).data;assert.equal(saved.integrity,true);assert.equal(saved.record.kind,"hrt_research");assert.equal(saved.record.response.outputHash,run.outputHash);
    const verified=await call("/api/research/hrt/verify",{runId:run.runId});assert.equal(verified.status,200);assert.equal(verified.data.status,"PASS");assert.equal(verified.data.saved,true);assert.equal(verified.data.checks.length,9);assert.ok(verified.data.checks.some(check=>check.name==="Production comparison reconciles"&&check.passed));
    const csv=await fetch(base+`/api/research/hrt?runId=${run.runId}&format=csv`,{headers:{Cookie:cookie}});assert.equal(csv.status,200);const lines=(await csv.text()).trim().split(/\r?\n/);assert.equal(lines.length,2001);assert.match(lines[0],/electricity_kwh_day/);assert.match(lines[1],/synthetic_research_model_evaluation_not_plant_measurement/);
    assert.equal((await call(`/api/research/hrt?runId=${run.runId}`,undefined,userCookie)).status,403);
    assert.equal((await call("/api/auth/logout",{})).status,200);cookie=await login("admin");
    const listed=(await call("/api/audit?limit=50")).data;assert.ok(listed.runs.some(r=>r.id===run.runId&&r.integrity));
    const fetched=(await call(`/api/research/hrt?runId=${run.runId}`)).data;assert.deepEqual(fetched.selected,run.selected);
  });
  await t.test("automatic runs change supported inputs, calculate predictions and replay saved seeds",async()=>{
    const defaults=(await call("/api/research/hrt")).data.defaults;
    for(const scenario of [null,[],{}, {mode:"manual"},{mode:"automatic",seed:"short"},{mode:"automatic",seed:22},{mode:"automatic",previousHrtHours:1.9},{mode:"automatic",previousHrtHours:24.1},{mode:"automatic",previousHrtHours:"12"},{mode:"automatic",noise:true}]){
      assert.equal((await call("/api/research/hrt",{...defaults,scenario})).status,422,JSON.stringify(scenario));
    }
    let previous=24,previousPrediction;
    for(let i=0;i<10;i++){
      const submitted={...defaults,scenario:{mode:"automatic",previousHrtHours:previous}};
      const response=await call("/api/research/hrt",submitted);assert.equal(response.status,200);
      const current=response.data;
      assert.equal(current.scenario.mode,"automatic");assert.ok(current.scenario.seed);
      assert.ok(current.scenario.hrtHours>=2&&current.scenario.hrtHours<=24);
      assert.ok(Math.abs(current.scenario.hrtHours-previous)>=1-1e-10);
      assert.equal(current.retentionTime.beforeHours,current.scenario.hrtHours);
      assert.equal(current.comparison.hrtHours,current.scenario.hrtHours);
      // A generated input must use the actual fitted prediction, without output jitter.
      const manual=(await call("/api/research/hrt",{...defaults,baseline:{value:current.scenario.hrtHours,unit:"hours"},objective:"target_hrt",targetHours:current.scenario.hrtHours})).data;
      assert.deepEqual(current.comparison,manual.selected);
      if(current.jointImprovement.status==="IMPROVED"){
        assert.ok(current.selected.biogasM3Day>current.comparison.biogasM3Day);
        assert.ok(current.selected.methaneM3Day>current.comparison.methaneM3Day);
        assert.ok(current.selected.electricityKwhDay>current.comparison.electricityKwhDay);
      }else{
        assert.equal(current.jointImprovement.status,"NO_JOINT_IMPROVEMENT");
        assert.deepEqual(current.selected,current.comparison);
      }
      if(previousPrediction)assert.notDeepEqual(current.comparison,previousPrediction);
      for(const item of current.recommendations)assert.equal(item.current,current.comparison[item.key]);
      const evidence=(await call(`/api/audit?runId=${current.runId}`)).data;
      assert.equal(evidence.integrity,true);assert.deepEqual(evidence.record.request,submitted);
      assert.equal(evidence.record.inputs.scenario.seed,current.scenario.seed);
      const replay=(await call("/api/research/hrt",current.request)).data;
      assert.notEqual(replay.runId,current.runId);assert.equal(replay.outputHash,current.outputHash);
      assert.deepEqual(replay.comparison,current.comparison);
      assert.equal((await call("/api/research/hrt/verify",{runId:current.runId})).data.status,"PASS");
      const copilot=(await call("/api/copilot",{question:"Why the same recommendation on each run?",mode:"HOURS_RESEARCH",researchRunId:current.runId})).data;
      assert.match(copilot.answer,current.jointImprovement.status==="IMPROVED"?/same optimization goal can return the same optimum/:/No candidate met the joint improvement rule/);
      assert.ok(copilot.answer.includes(current.comparison.biogasM3Day.toFixed(2)));
      previous=current.scenario.hrtHours;previousPrediction=current.comparison;
    }
  });
  await t.test("different eligible candidates keep the same baseline and reconcile every output",async()=>{
    const defaults=(await call("/api/research/hrt")).data.defaults;
    for(const previousSelectedHrtHours of [null,"22",1.9,24.1])assert.equal((await call("/api/research/hrt",{...defaults,previousSelectedHrtHours})).status,422);
    let previous=(await call("/api/research/hrt",defaults)).data;
    const comparison=previous.comparison;
    for(let i=0;i<5;i++){
      const payload={...defaults,previousSelectedHrtHours:previous.selected.hrtHours};
      const response=await call("/api/research/hrt",payload);assert.equal(response.status,200);
      const current=response.data;
      assert.deepEqual(current.comparison,comparison,"candidate variation cannot change the submitted baseline");
      assert.equal(current.jointImprovement.status,"IMPROVED");
      assert.equal(current.candidateSelection.changedFromPrevious,true);
      assert.ok(current.candidateSelection.alternativeCount>0);
      for(const [key,digits] of [["biogasM3Day",1],["methaneM3Day",1],["electricityKwhDay",2]]){
        assert.ok(current.selected[key]>comparison[key]+1/365,key);
        assert.notEqual(current.selected[key].toFixed(digits),previous.selected[key].toFixed(digits),key);
      }
      assert.deepEqual(current.selected,current.candidates.find(p=>p.hrtHours===current.selected.hrtHours),"all fields must belong to one actually evaluated candidate");
      assert.deepEqual(current.candidatePreview[0],current.selected,"preview starts with the actual selected candidate");
      assert.equal(current.selected.methaneM3Day,current.selected.biogasM3Day*current.selected.methanePct/100);
      assert.equal(current.selected.electricityKwhDay,current.selected.methaneM3Day*9.97*.36);
      assert.equal((await call("/api/research/hrt",current.request)).data.outputHash,current.outputHash);
      if(i===0)assert.equal((await call("/api/research/hrt/verify",{runId:current.runId})).data.status,"PASS");
      previous=current;
    }
    const maximum={...defaults,objective:"maximum_energy"};
    const best=(await call("/api/research/hrt",maximum)).data;
    const another=(await call("/api/research/hrt",{...maximum,previousSelectedHrtHours:best.selected.hrtHours})).data;
    assert.equal(another.candidateSelection.changedFromPrevious,true);assert.equal(another.jointImprovement.status,"IMPROVED");
    assert.ok(another.selected.electricityKwhDay>another.comparison.electricityKwhDay);
    assert.ok(another.selected.electricityKwhDay<best.selected.electricityKwhDay,"new selection is ranked within distinct eligible alternatives");
    assert.deepEqual(another.comparison,best.comparison);
    const explanation=(await call("/api/copilot",{question:"Why this HRT?",mode:"HOURS_RESEARCH",researchRunId:another.runId})).data;
    assert.match(explanation.answer,/among eligible candidates with production values that differ from the previous selection/);
    const repetition=(await call("/api/copilot",{question:"Why does this repeat run change?",mode:"HOURS_RESEARCH",researchRunId:another.runId})).data;
    assert.match(repetition.answer,/different qualifying production scenario/);assert.match(repetition.answer,/baseline fixed/);
  });
  await t.test("variation cannot manufacture gains, resample a baseline or change an exact target",async()=>{
    const defaults=(await call("/api/research/hrt")).data.defaults;
    for(const hours of [13.5,20.6,2]){
      const current=(await call("/api/research/hrt",{...defaults,baseline:{value:hours,unit:"hours"},previousSelectedHrtHours:22})).data;
      assert.equal(current.comparison.hrtHours,hours);assert.deepEqual(current.selected,current.comparison);
      assert.equal(current.jointImprovement.status,"NO_JOINT_IMPROVEMENT");assert.equal(current.candidateSelection.eligibleCount,0);
    }
    const target=(await call("/api/research/hrt",{...defaults,objective:"target_hrt",targetHours:21.5,previousSelectedHrtHours:21.5})).data;
    assert.equal(target.selected.hrtHours,21.5);assert.equal(target.candidateSelection.strategy,"EXACT_REQUESTED_HRT");
    const peak=(await call("/api/research/hrt",{...defaults,retainedMethanePct:100})).data;
    const only=(await call("/api/research/hrt",{...defaults,retainedMethanePct:100,previousSelectedHrtHours:peak.selected.hrtHours})).data;
    assert.deepEqual(only.selected,peak.selected);assert.equal(only.candidateSelection.alternativeCount,0);assert.equal(only.candidateSelection.changedFromPrevious,false);
    const automatic={...defaults,scenario:{mode:"automatic",seed:"baseline-fixed-review",previousHrtHours:24}};
    const before=(await call("/api/research/hrt",automatic)).data;
    const after=(await call("/api/research/hrt",{...automatic,previousSelectedHrtHours:before.selected.hrtHours})).data;
    assert.deepEqual(after.scenario,before.scenario);assert.deepEqual(after.comparison,before.comparison);
  });
  await t.test("tampered research records cannot be exported or replayed",async()=>{
    const file=path.join(storage,"audit-v2/records",run.runId+".json"),record=JSON.parse(await readFile(file,"utf8"));record.response.selected.hrtHours=.5;await writeFile(file,JSON.stringify(record));
    assert.equal((await call(`/api/research/hrt?runId=${run.runId}`)).status,409);
    assert.equal((await call("/api/research/hrt/verify",{runId:run.runId})).status,409);
    assert.equal((await call("/api/copilot",{question:"HRT?",mode:"HOURS_RESEARCH",researchRunId:run.runId})).status,409);
    const csv=await fetch(base+`/api/research/hrt?runId=${run.runId}&format=csv`,{headers:{Cookie:cookie}});assert.equal(csv.status,409);
  });
});
