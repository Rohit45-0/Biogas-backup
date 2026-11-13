import {createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual} from "node:crypto";
import {accountNames, readSecurity, writeSecurity} from "./security-store";

export type AquaRole = "admin" | "user" | "reviewer";
export type AquaSession = {username:string; role:AquaRole; expiresAt:number; id?:string; credentialVersion?:string; version?:2};
type Account = {username:string; displayName:string; role:AquaRole; passwordHash:string; version:string; disabled:boolean; updatedAt:string};
type StoredSession = AquaSession & {state:"active"|"revoked"; issuedAt:string; revokedAt?:string};
export const SESSION_COOKIE = "aqua_session";
const usernamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/;
export const canAudit = (session:AquaSession) => session.role === "admin" || session.role === "reviewer";
export function sameOrigin(request:Request) {
  const origin=request.headers.get("origin");if(!origin)return true;
  try {
    // Next may expose an internal localhost URL behind its HTTP server/proxy.
    // Compare the browser origin with the externally addressed host/protocol.
    const url=new URL(request.url),host=request.headers.get("x-forwarded-host")||request.headers.get("host")||url.host;
    const protocol=request.headers.get("x-forwarded-proto")||url.protocol.slice(0,-1);
    if(!["http","https"].includes(protocol)||host.includes(","))return false;
    return origin===new URL(protocol+"://"+host).origin;
  }catch{return false;}
}
function secret() { const value=process.env.AQUA_SESSION_SECRET; if (!value) throw new Error("Session secret unavailable"); return value; }
function sign(value:string) { return createHmac("sha256",secret()).update(value).digest("base64url"); }
function safeEqual(a:string,b:string) { const x=Buffer.from(a), y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
function passwordHash(value:string) { const salt=randomBytes(16).toString("hex"); return salt+":"+scryptSync(value,salt,64).toString("hex"); }
function passwordMatches(value:string,hash:string) { const [salt,digest]=hash.split(":"); return Boolean(salt&&digest&&safeEqual(scryptSync(value,salt,64).toString("hex"),digest)); }
function legacy(username:string) {
  if(username===(process.env.AQUA_ADMIN_USERNAME||"admin"))return {role:"admin" as const,password:process.env.AQUA_ADMIN_PASSWORD||""};
  if(username===(process.env.AQUA_USER_USERNAME||"user"))return {role:"user" as const,password:process.env.AQUA_USER_PASSWORD||""};
  return null;
}
async function account(username:string) { return usernamePattern.test(username)?readSecurity<Account>("accounts/"+username):null; }
async function currentIdentity(username:string) {
  const saved=await account(username);
  if(saved)return saved.disabled?null:{role:saved.role,version:saved.version};
  const old=legacy(username);
  return old?.password?{role:old.role,version:sign("credential:"+username+":"+old.password)}:null;
}
export function authConfigured() { return Boolean(process.env.AQUA_SESSION_SECRET&&process.env.AQUA_ADMIN_PASSWORD&&process.env.AQUA_USER_PASSWORD); }
export async function authenticate(username:string,password:string):Promise<AquaSession|null> {
  if(!usernamePattern.test(username)||!password||password.length>256)return null;
  const saved=await account(username), old=legacy(username);
  const accepted=saved?!saved.disabled&&passwordMatches(password,saved.passwordHash):Boolean(old?.password&&safeEqual(old.password,password));
  if(!accepted)return null;
  // Bind to the exact credential snapshot that was checked. A concurrent
  // password rotation must not upgrade an old-password login to the new version.
  const identity=saved?{role:saved.role,version:saved.version}:old?{role:old.role,version:sign("credential:"+username+":"+old.password)}:null; if(!identity)return null;
  return {username,role:identity.role,credentialVersion:identity.version,expiresAt:Date.now()+8*60*60*1000,id:randomUUID(),version:2};
}
export async function createSessionToken(session:AquaSession) {
  if(!session.id||!session.credentialVersion||session.version!==2)throw new Error("Versioned session required");
  await writeSecurity("sessions/"+session.id,{...session,state:"active",issuedAt:new Date().toISOString()} satisfies StoredSession);
  const payload=Buffer.from(JSON.stringify(session)).toString("base64url");
  return payload+"."+sign(payload);
}
function tokenSession(request:Request):AquaSession|null {
  try {
    const token=request.headers.get("cookie")?.split(";").map(p=>p.trim()).find(p=>p.startsWith(SESSION_COOKIE+"="))?.slice(SESSION_COOKIE.length+1);
    if(!token||token.length>4096)return null;
    const parts=token.split("."); if(parts.length!==2||!safeEqual(parts[1],sign(parts[0])))return null;
    const s=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8")) as AquaSession;
    // Stateless cookies issued before migration are deliberately rejected.
    if(s.version!==2||!s.id||!/^[a-f0-9-]{36}$/.test(s.id)||!usernamePattern.test(s.username)||!s.credentialVersion||!["admin","user","reviewer"].includes(s.role)||!Number.isFinite(s.expiresAt)||s.expiresAt<=Date.now())return null;
    return s;
  } catch { return null; }
}
export async function getSession(request:Request):Promise<AquaSession|null> {
  const s=tokenSession(request); if(!s)return null;
  try {
    const [stored,identity,revocation]=await Promise.all([readSecurity<StoredSession>("sessions/"+s.id),currentIdentity(s.username),readSecurity<{before:number}>("revocations/"+s.username)]);
    if(!stored||stored.state!=="active"||stored.username!==s.username||stored.role!==s.role||stored.expiresAt!==s.expiresAt||stored.credentialVersion!==s.credentialVersion||identity?.role!==s.role||identity.version!==s.credentialVersion)return null;
    if(revocation&&Date.parse(stored.issuedAt)<=revocation.before)return null;
    return s;
  } catch { return null; } // Storage errors never authorize access.
}
export async function revokeSession(request:Request) {
  const s=tokenSession(request); if(!s)return;
  const stored=await readSecurity<StoredSession>("sessions/"+s.id);
  if(stored&&stored.state!=="revoked")await writeSecurity("sessions/"+s.id,{...stored,state:"revoked",revokedAt:new Date().toISOString()},true);
}
export async function revokeAccountSessions(username:string) {
  if(!usernamePattern.test(username))throw new Error("Invalid username");
  await writeSecurity("revocations/"+username,{before:Date.now()},true);
}
export async function listAccounts() {
  const names=[...new Set([process.env.AQUA_ADMIN_USERNAME||"admin",process.env.AQUA_USER_USERNAME||"user",...await accountNames()])];
  return Promise.all(names.map(async username=>{const a=await account(username),old=legacy(username);return {username,displayName:a?.displayName||username,role:a?.role||old?.role,disabled:a?.disabled||false,source:a?"managed":"environment",updatedAt:a?.updatedAt||null};}));
}
export async function saveAccount(value:{username:string;displayName:string;role:AquaRole;password:string},createOnly=true) {
  if(!usernamePattern.test(value.username)||!value.displayName.trim()||value.displayName.length>100||!["admin","user","reviewer"].includes(value.role))throw new Error("Use a username of 3–64 letters, digits, dots, underscores or hyphens and a display name.");
  if(value.password.length<12||value.password.length>128)throw new Error("New passwords must contain 12–128 characters.");
  const existing=await account(value.username);
  if(createOnly&&(existing||legacy(value.username)))throw new Error("This username already exists. Choose an individually assigned username.");
  const result:Account={username:value.username,displayName:value.displayName.trim(),role:value.role,passwordHash:passwordHash(value.password),version:randomUUID(),disabled:false,updatedAt:new Date().toISOString()};
  await writeSecurity("accounts/"+value.username,result,Boolean(existing));
  return {username:result.username,displayName:result.displayName,role:result.role};
}
export async function changePassword(username:string,currentPassword:string,newPassword:string) {
  if(!await authenticate(username,currentPassword))throw new Error("Current password is incorrect.");
  const old=await account(username), identity=await currentIdentity(username); if(!identity)throw new Error("Account unavailable");
  return saveAccount({username,displayName:old?.displayName||username,role:identity.role,password:newPassword},false);
}
export async function disableAccount(username:string) {
  const old=await account(username);
  if(!old)throw new Error("Only individually created accounts can be disabled here.");
  await writeSecurity("accounts/"+username,{...old,disabled:true,version:randomUUID(),updatedAt:new Date().toISOString()},true);
}
