import {NextResponse} from "next/server";
import {sameOrigin,authenticate,disableAccount,getSession,listAccounts,revokeAccountSessions,saveAccount,type AquaRole} from "../../../lib/auth";
import {SecurityStoreUnavailable} from "../../../lib/security-store";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request) {
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
  try{return NextResponse.json({accounts:await listAccounts(),roles:{reviewer:"Inspect/export evidence and run model verification; no account, threshold, plant-observation or operator-review changes.",user:"Dashboard viewing.",admin:"Account and operational administration."}},{headers});}
  catch{return NextResponse.json({error:"Account storage unavailable"},{status:503,headers});}
}
export async function POST(request:Request) {
  const session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(session.role!=="admin")return NextResponse.json({error:"Admin access required"},{status:403,headers});
  if(!sameOrigin(request))return NextResponse.json({error:"Invalid origin"},{status:403,headers});
  let body:Record<string,unknown>;
  try{const raw=await request.text();if(raw.length>6000)throw new Error();body=JSON.parse(raw);if(!body||typeof body!=="object")throw new Error();}
  catch{return NextResponse.json({error:"Valid JSON object required"},{status:400,headers});}
  try {
    // Require the acting admin's password for credential and account changes.
    if(!await authenticate(session.username,String(body.currentPassword??"")))return NextResponse.json({error:"Current admin password required"},{status:403,headers});
    const username=String(body.username??"");
    if(body.action==="create")return NextResponse.json({account:await saveAccount({username,displayName:String(body.displayName??""),role:body.role as AquaRole,password:String(body.password??"")})},{status:201,headers});
    if(body.action==="revoke_sessions"){await revokeAccountSessions(username);return NextResponse.json({revoked:true,username},{headers});}
    if(body.action==="disable"){
      if(username===session.username)return NextResponse.json({error:"Cannot disable your own account"},{status:422,headers});
      await disableAccount(username);return NextResponse.json({disabled:true,username},{headers});
    }
    return NextResponse.json({error:"Choose create, revoke_sessions or disable"},{status:422,headers});
  } catch(error) { return NextResponse.json({error:error instanceof SecurityStoreUnavailable?"Security storage unavailable":error instanceof Error?error.message:"Account update failed"},{status:error instanceof SecurityStoreUnavailable?503:422,headers}); }
}
