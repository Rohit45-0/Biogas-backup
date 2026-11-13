"use client";
import {useEffect,useState,type FormEvent} from "react";
import "./account-security.css";
type Account={username:string;displayName:string;role:string;source:string;disabled:boolean};
export default function AccountSecurity({admin}:{admin:boolean}) {
  const [accounts,setAccounts]=useState<Account[]>([]),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const [currentPassword,setCurrent]=useState(""),[newPassword,setNew]=useState(""),[username,setUsername]=useState(""),[displayName,setDisplayName]=useState(""),[role,setRole]=useState("reviewer");
  async function request(url:string,body?:unknown) {const r=await fetch(url,{method:body?"POST":"GET",cache:"no-store",headers:{"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
  useEffect(()=>{if(admin)void request("/api/auth/accounts").then(d=>setAccounts(d.accounts)).catch(e=>setError(e.message));},[admin]);
  async function act(action:string,target?:string) {
    setBusy(true);setError("");setNotice("");
    try {
      if(action==="password"){await request("/api/auth/password",{currentPassword,newPassword});setNotice("Password changed. All sessions for this account are invalid. Sign in again.");window.location.reload();return;}
      await request("/api/auth/accounts",{action,username:target||username,displayName,role,password:newPassword,currentPassword});
      setAccounts((await request("/api/auth/accounts")).accounts);setNotice(action==="create"?"Account created. Share credentials privately with its assigned person.":"Account security updated.");setNew("");setCurrent("");
    }catch(e){setError(e instanceof Error?e.message:"Account update failed");}finally{setBusy(false);}
  }
  function submit(e:FormEvent){e.preventDefault();void act("create");}
  return <section className="account-security" aria-label="Account security">
    <h2>Account security</h2><p>Logout invalidates the session on the server. A password change invalidates every session for that account.</p>
    {error&&<p role="alert" className="hr-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="as-fields"><label>Current password<input autoComplete="current-password" type="password" value={currentPassword} onChange={e=>setCurrent(e.target.value)}/></label><label>New password (12–128 characters)<input autoComplete="new-password" type="password" minLength={12} maxLength={128} value={newPassword} onChange={e=>setNew(e.target.value)}/></label></div>
    <button disabled={busy||!currentPassword||newPassword.length<12} onClick={()=>void act("password")}>Change my password & sign out</button>
    {admin&&<><h3>Individually assigned accounts</h3><p>Reviewers can inspect evidence and run model tests. They cannot manage accounts, change thresholds, submit plant measurements or acknowledge operational alarms.</p>
      <form onSubmit={submit}><div className="as-fields"><label>Username<input required pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}" value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Assigned person<input required value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={100}/></label><label>Access<select value={role} onChange={e=>setRole(e.target.value)}><option value="reviewer">Reviewer — audit tests</option><option value="admin">Admin — separate testing account</option><option value="user">User — dashboard</option></select></label></div><button disabled={busy||!currentPassword||newPassword.length<12}>Create account using new password above</button></form>
      <div className="as-table"><table><thead><tr><th>Account</th><th>Assigned person</th><th>Access</th><th>Status</th><th>Sessions</th></tr></thead><tbody>{accounts.map(a=><tr key={a.username}><td>{a.username}</td><td>{a.displayName}</td><td>{a.role}</td><td>{a.disabled?"Disabled":"Active"}</td><td><button disabled={busy||!currentPassword} onClick={()=>void act("revoke_sessions",a.username)}>Revoke sessions</button>{a.source==="managed"&&!a.disabled&&<button disabled={busy||!currentPassword} onClick={()=>void act("disable",a.username)}>Disable account</button>}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
