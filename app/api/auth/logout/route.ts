import { NextResponse } from "next/server";
import {sameOrigin, revokeSession, SESSION_COOKIE } from "../../../lib/auth";

export async function POST(request: Request) {
  if(!sameOrigin(request))return NextResponse.json({error:"Invalid request origin"},{status:403});
  try { await revokeSession(request); }
  catch {return NextResponse.json({error:"Server logout could not be confirmed. Retry logout."},{status:503,headers:{"Cache-Control":"no-store"}});}
  const response = NextResponse.json({ ok: true, serverRevoked:true },{headers:{"Cache-Control":"no-store"}});
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`);
  return response;
}
