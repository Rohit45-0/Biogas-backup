import {NextResponse} from "next/server";
import {getSession} from "../../../lib/auth";
import {InputError} from "../../../lib/inputs";
import {checkScenarioInputs,scenarioCoverageCatalog} from "../../../lib/scenario-input-coverage";

export const runtime="nodejs";
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request){
  if(!await getSession(request))return NextResponse.json({error:"Sign in required"},{status:401,headers});
  return NextResponse.json(scenarioCoverageCatalog,{headers});
}
export async function POST(request:Request){
  if(!await getSession(request))return NextResponse.json({error:"Sign in required"},{status:401,headers});
  let body:unknown;
  try{const text=await request.text();if(text.length>8000)return NextResponse.json({error:"Request too large"},{status:413,headers});body=JSON.parse(text);}catch{return NextResponse.json({error:"Valid JSON is required"},{status:400,headers});}
  try{return NextResponse.json(checkScenarioInputs(body),{headers});}
  catch(error){if(error instanceof InputError)return NextResponse.json({error:error.message,issues:error.issues},{status:422,headers});return NextResponse.json({error:"Scenario input coverage could not be checked"},{status:500,headers});}
}
