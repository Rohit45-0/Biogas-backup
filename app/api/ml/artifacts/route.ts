import {readFile} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {NextResponse} from "next/server";
import {getSession,canAudit} from "../../../lib/auth";
import {mlManifest,mlManifestHash} from "../../../lib/ml-manifest";
import build from "../../../lib/trained-build.json";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store"};
export async function GET(request:Request) {
 const session=await getSession(request);
 if(!session)return NextResponse.json({error:"Sign in required"},{status:401,headers});
 if(!canAudit(session))return NextResponse.json({error:"Reviewer or admin access required"},{status:403,headers});
 const file=new URL(request.url).searchParams.get("file");
 if(!file||file==="manifest")return NextResponse.json({manifest:mlManifest,manifestHash:mlManifestHash,sourceFiles:build,sourceRevision:process.env.AQUA_SOURCE_REVISION||process.env.VERCEL_GIT_COMMIT_SHA||null,deployment:process.env.VERCEL_DEPLOYMENT_ID||"local",downloads:["bundle","ridge","gradient_boosting","registry","runner","methodology","protocol","checklist","investigation"].map(id=>({id,url:"/api/ml/artifacts?file="+id}))},{headers});
 const model=file==="ridge"||file==="gradient_boosting"?mlManifest.models[file]:null;
 const known:Record<string,string>={registry:"ai-workflow/models/onnx/manifest.json",runner:"scripts/independent-model-check.py",methodology:"docs/MODEL_VERIFICATION_2026-11-20.md",protocol:"docs/PLANT_VALIDATION_PROTOCOL_2026-11-20.md",checklist:"docs/AUDITOR_RETEST_2026-11-20.md",investigation:"docs/HISTORICAL_INTEGRITY_INVESTIGATION_2026-11-20.md",bundle:"release-assets/AQUAIVOLT-Model-Verification-2026-11-20.zip"};
 const filename=model?"ai-workflow/models/onnx/"+model.filename:known[file];
 if(!filename)return NextResponse.json({error:"Unknown artifact"},{status:404,headers});
 try {
  const bytes=await readFile(path.join(process.cwd(),filename)),digest="sha256:"+createHash("sha256").update(bytes).digest("hex");
  if(model&&digest!==model.artifactHash)throw new Error("Artifact integrity failed");
  return new Response(bytes,{headers:{...headers,"Content-Type":file==="registry"?"application/json":file==="bundle"?"application/zip":"application/octet-stream","Content-Disposition":'attachment; filename="'+path.basename(filename)+'"',"X-Artifact-SHA256":digest}});
 }catch{return NextResponse.json({error:"Artifact unavailable or checksum mismatch"},{status:503,headers});}
}
