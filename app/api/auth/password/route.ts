import {NextResponse} from "next/server";
import {sameOrigin,changePassword,getSession,SESSION_COOKIE} from "../../../lib/auth";
export const runtime="nodejs";
export async function POST(request:Request) {
  const headers={"Cache-Control":"no-store"},session=await getSession(request);
  if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
  if(!sameOrigin(request))return NextResponse.json({error:"Invalid origin"},{status:403,headers});
  try {
    const raw=await request.text();if(raw.length>4096)return NextResponse.json({error:"Request too large"},{status:413,headers});
    const body=JSON.parse(raw);
    await changePassword(session.username,String(body.currentPassword??""),String(body.newPassword??""));
    const response=NextResponse.json({changed:true,allAccountSessionsInvalidated:true,signInAgain:true},{headers});
    response.headers.set("Set-Cookie",SESSION_COOKIE+"=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"+(new URL(request.url).protocol==="https:"?"; Secure":""));
    return response;
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Password update failed"},{status:422,headers});}
}
