"use client";

import {useEffect,useState,type FormEvent} from "react";
import {ClipboardCheck,Eye,EyeOff,Menu,X} from "lucide-react";
import HrtResearchWorkspace,{type ResearchView} from "./components/HrtResearchWorkspace";
import AuditTrail from "./components/AuditTrail";
import DemoMonitoring,{DemoMonitoringProvider} from "./components/DemoMonitoring";
import EarlyWarningWorkspace from "./components/EarlyWarningWorkspace";
import {ScenarioAlertsProvider,ScenarioAlertBanner,ScenarioAlertCount} from "./components/ScenarioAlerts";
import "./responsive.css";
import "./login.css";
import "./dashboard-theme.css";

type AuthUser={username:string;role:"admin"|"user"};
const navigation:[ResearchView,string,string][]=[
  ["overview","⌂","Overview"],["workbook","▦","Workbook AI reading"],
  ["biogas","◒","Biogas"],["methane","◆","Methane"],["electricity","ϟ","Electricity"],
  ["process","⌁","Process monitor"],["hrt","◷","HRT in hours"],["optimizer","✦","AI optimizer"],
  ["reports","≡","AI & KPI reports"],["monitoring","◉","Gas monitoring"],["sites","⌖","Lebanon sites"],["alerts","△","Alerts"],["sources","▤","Data sources"],["settings","⚙","Settings"],
];

export default function Home(){
  const [auth,setAuth]=useState<AuthUser|null>(null),[checking,setChecking]=useState(true);
  const [username,setUsername]=useState(""),[password,setPassword]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [loginError,setLoginError]=useState(""),[loginBusy,setLoginBusy]=useState(false);
  const [view,setView]=useState<ResearchView>("overview"),[auditOpen,setAuditOpen]=useState(false),[auditRunId,setAuditRunId]=useState("");
  const [navOpen,setNavOpen]=useState(false);
  const [warningEntry,setWarningEntry]=useState<{key:number;index?:number}>({key:0});
  useEffect(()=>{if(!navOpen)return;const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setNavOpen(false);};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[navOpen]);
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try{const response=await fetch("/api/auth/session",{cache:"no-store"});if(response.ok){const data=await response.json();if(active)setAuth(data.user);}}
      catch{if(active)setLoginError("Could not check the session. Please sign in again.");}
      finally{if(active)setChecking(false);}
    })();
    return()=>{active=false;};
  },[]);
  async function login(event:FormEvent){
    event.preventDefault();setLoginBusy(true);setLoginError("");
    try{
      const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Login failed");
      setAuth(data.user);setPassword("");setShowPassword(false);setView("overview");setAuditOpen(false);setAuditRunId("");setNavOpen(false);
    }catch(error){setLoginError(error instanceof Error?error.message:"Login failed");}
    finally{setLoginBusy(false);}
  }
  async function logout(){
    try{
      const response=await fetch("/api/auth/logout",{method:"POST"});if(!response.ok)throw new Error("Logout failed");
      setAuth(null);setShowPassword(false);setView("overview");setAuditOpen(false);setAuditRunId("");setLoginError("");setNavOpen(false);
    }catch{setLoginError("Could not log out. Check the connection and retry.");}
  }
  function openView(next:ResearchView="overview"){setView(next);setAuditOpen(false);setNavOpen(false);window.scrollTo({top:0});}
  function openEarlyWarning(index?:number){setWarningEntry(old=>({key:old.key+1,index}));openView("alerts");}
  function openAudit(id=""){setAuditRunId(id);setAuditOpen(true);setNavOpen(false);window.scrollTo({top:0});}
  if(checking)return <main className="loading-screen"><span>◒</span><b>Opening Aquaivolt…</b></main>;
  if(!auth)return <main className="login-page">
    <section className="login-story"><div className="simple-brand light"><span>◒</span><b>AQUAIVOLT<small>WASTE TO ENERGY</small></b></div><div><small>AI BIOGAS PLATFORM</small><h1>One optimization action.<br/>Clear production results.</h1><p>Explore biogas, methane and electricity with the hours-scale model.</p></div><em>Research model · Plant validation pending</em></section>
    <section className="login-form-wrap"><form onSubmit={login}>
      <span className="login-icon">✦</span><small>SECURE ACCESS</small><h2>Sign in</h2><p>Use your Aquaivolt admin or user account.</p>
      <label><span>Username</span><input value={username} onChange={event=>setUsername(event.target.value)} autoComplete="username" required/></label>
      <div className="login-password-group">
        <label htmlFor="login-password"><span>Password</span></label>
        <div className="login-password-field">
          <input id="login-password" type={showPassword?"text":"password"} value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" required/>
          <button type="button" className="login-password-toggle" aria-label={showPassword?"Hide password":"Show password"} aria-controls="login-password" onClick={()=>setShowPassword(visible=>!visible)}>
            {showPassword?<EyeOff size={18} aria-hidden="true"/>:<Eye size={18} aria-hidden="true"/>}<span aria-hidden="true">{showPassword?"Hide":"Show"}</span>
          </button>
        </div>
      </div>
      {loginError&&<div className="login-error">{loginError}</div>}
      <button disabled={loginBusy}>{loginBusy?"Checking…":"Continue →"}</button>
    </form></section>
  </main>;
  return <ScenarioAlertsProvider key={auth.username} username={auth.username}><DemoMonitoringProvider username={auth.username} admin={auth.role==="admin"}><main className="simple-shell">
    {navOpen&&<button type="button" className="sidebar-scrim" aria-label="Close navigation" onClick={()=>setNavOpen(false)}/>}
    <aside className={`simple-sidebar${navOpen?" is-open":""}`} id="aqua-navigation" aria-label="Aquaivolt navigation">
      <div className="simple-brand"><span>◒</span><b>AQUAIVOLT<small>WASTE TO ENERGY</small></b></div>
      <div className="research-mode-switch"><small>{!auditOpen&&["monitoring","sites","alerts"].includes(view)?<>Reference data & recorded alerts<br/>Independent of optimization</>:view==="hrt"&&!auditOpen?"HRT STUDIES · EXPLICIT TIME UNITS":"SAME-TANK PRODUCTION · BEFORE / AFTER"}</small><button className="selected" onClick={()=>openView()}>Hours-scale research</button></div>
      <nav>{navigation.map(([key,icon,label])=><div key={key}>{["biogas","process","monitoring","sources"].includes(key)&&<div className="pd-nav-label">{key==="biogas"?"PRODUCTION OPTIMIZATION":key==="process"?"ANALYTICS":key==="monitoring"?"MONITORING & ALERTS":"SYSTEM"}</div>}<button aria-label={label} className={!auditOpen&&view===key?"active":""} onClick={()=>openView(key)}><span aria-hidden="true">{icon}</span><span className="sidebar-label">{label}{key==="alerts"&&<ScenarioAlertCount/>}{key==="hrt"&&<small className="sidebar-task2-badge" aria-hidden="true">HRT model</small>}</span></button></div>)}
        {auth.role==="admin"&&<button className={auditOpen?"active":""} onClick={()=>openAudit()} aria-label="Audit Trail"><span><ClipboardCheck size={17}/></span><span className="sidebar-label">Audit Trail</span></button>}
      </nav>
      <div className="side-note"><b>SYSTEM STATUS</b><span>{!auditOpen&&["monitoring","sites","alerts"].includes(view)?"MONITORING & ALERTS":view==="hrt"&&!auditOpen?"HRT TECHNOLOGY STUDIES":"SAME-TANK MODEL"}</span><small>{!auditOpen&&["monitoring","sites","alerts"].includes(view)?<>Reference data & recorded alerts<br/>Independent of optimization</>:view==="hrt"&&!auditOpen?<>2,000 generated scenarios per AI run<br/>400 training records</>:<>2,000 scenarios evaluated per run<br/>500 training records<br/>Source BEFORE / model AFTER</>}<br/>IoT sensors: Not connected</small></div>
      <button className="side-logout" onClick={()=>void logout()}>Log out</button>
    </aside>
    <section className="simple-workspace" id="overview">
      <button type="button" className="sidebar-toggle" aria-controls="aqua-navigation" aria-expanded={navOpen} aria-label={navOpen?"Close navigation":"Open navigation"} onClick={()=>setNavOpen(open=>!open)}>{navOpen?<X size={22}/>:<Menu size={22}/>}<span>Menu</span></button>
      {loginError&&<div className="login-error" role="alert">{loginError}</div>}
      {!auditOpen&&!["alerts","monitoring","sites"].includes(view)&&<ScenarioAlertBanner onOpen={()=>openView("alerts")}/>}
      {auditOpen&&auth.role==="admin"&&<AuditTrail key={auditRunId||"audit"} initialRunId={auditRunId} onOverview={()=>openView()}/>}
      {!auditOpen&&["monitoring","sites"].includes(view)&&<DemoMonitoring initialTab={view==="sites"?"Lebanon sites":"Readings"} onOptimize={()=>openView("overview")} onAudit={openAudit} onEarlyWarning={openEarlyWarning}/>}
      {!auditOpen&&view==="alerts"&&<EarlyWarningWorkspace key={`warning-${warningEntry.key}`} initialIndex={warningEntry.index} admin={auth.role==="admin"} onOptimize={()=>openView("overview")} onAudit={openAudit} onEarlyWarning={openEarlyWarning}/>}
      <div hidden={auditOpen||["monitoring","sites"].includes(view)}><details open={view!=="alerts"}><summary hidden={view!=="alerts"} style={{padding:20}}>Existing model input coverage checks</summary><HrtResearchWorkspace key={auth.username} view={["monitoring","sites"].includes(view)?"overview":view} role={auth.role} onView={openView} onAudit={openAudit}/></details></div>
    </section>
  </main></DemoMonitoringProvider></ScenarioAlertsProvider>;
}
