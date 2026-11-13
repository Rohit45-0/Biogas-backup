import { NextResponse } from "next/server";
import {sameOrigin, authenticate, authConfigured, createSessionToken, SESSION_COOKIE } from "../../../lib/auth";

export async function POST(request: Request) {
  if(!sameOrigin(request))return NextResponse.json({error:"Invalid request origin"},{status:403});
  if (!authConfigured()) return NextResponse.json({ error: "Login is not configured." }, { status: 503 });
  let body:{username?:string;password?:string};
  try { const raw=await request.text();if(raw.length>4096)throw new Error();body=JSON.parse(raw);if(!body||typeof body!=="object")throw new Error(); } catch {return NextResponse.json({error:"Valid login JSON required"},{status:400});}
  try {
  const session = await authenticate(String(body.username ?? "").trim(), String(body.password ?? ""));
  if (!session) return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  const response = NextResponse.json({ user: { username: session.username, role: session.role }, expiresAt: session.expiresAt },{headers:{"Cache-Control":"no-store"}});
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${await createSessionToken(session)}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=28800`);
  return response;
  } catch {return NextResponse.json({error:"Secure session storage is unavailable. Please retry."},{status:503,headers:{"Cache-Control":"no-store"}});}
}
