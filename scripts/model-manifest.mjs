import fs from "node:fs/promises";
import {createHash} from "node:crypto";
// Source identity must survive Windows checkouts and Linux deployment builds.
// Keep JSON artifact hashes byte-exact, including the archived model registry.
const sourceHash=async file=>createHash("sha256").update(file.endsWith(".json")?await fs.readFile(file):(await fs.readFile(file,"utf8")).replace(/\r\n/g,"\n")).digest("hex");
const files=["app/lib/model.ts","app/lib/inputs.ts","app/lib/system.ts","app/lib/reference-data.ts","app/lib/domain.ts","app/lib/hrt.ts"];
const hashes={};
for(const file of files)hashes[file]=await sourceHash(file);
await fs.writeFile("app/lib/model-build.json",JSON.stringify({sourceHash:`sha256:${createHash("sha256").update(JSON.stringify(hashes)).digest("hex")}`,files:hashes},null,2)+"\n");
const trainedFiles=["app/lib/ml-contract.ts","app/lib/ml-runtime.ts","app/lib/ml-execution.ts","app/lib/ml-manifest.ts","app/lib/inputs.ts","app/lib/reference-data.ts","app/lib/domain.ts","app/api/ml/predict/route.ts","app/api/ml/verify/route.ts","ai-workflow/models/onnx/manifest.json"];
const trainedHashes={};
for(const file of trainedFiles)trainedHashes[file]=await sourceHash(file);
const registry=JSON.parse(await fs.readFile("ai-workflow/models/onnx/manifest.json","utf8"));
for(const model of Object.values(registry.models)){
  const bytes=await fs.readFile(`ai-workflow/models/onnx/${model.filename}`);
  if(`sha256:${createHash("sha256").update(bytes).digest("hex")}`!==model.artifactHash)throw new Error(`Model artifact hash mismatch: ${model.filename}`);
}
await fs.writeFile("app/lib/trained-build.json",JSON.stringify({sourceHash:`sha256:${createHash("sha256").update(JSON.stringify(trainedHashes)).digest("hex")}`,files:trainedHashes},null,2)+"\n");
const researchFiles=["app/lib/workbook-comparison.ts","app/lib/research-result-integrity.ts","app/lib/hrt-research.ts","app/lib/research-candidate-selection.ts","app/lib/hrt-research-execution.ts","app/lib/hrt.ts","app/api/research/hrt/route.ts","app/api/research/hrt/verify/route.ts","ai-workflow/research/hours-model.json","ai-workflow/research/hours-data.json"];
const researchHashes={};
researchFiles.push("app/lib/paired-scenarios.ts","ai-workflow/research/paired-200-2026-11-07/model.json","ai-workflow/research/paired-200-2026-11-07/inputs.json","ai-workflow/research/paired-200-2026-11-07/source.json");
researchFiles.push("app/lib/same-tank-model.ts","ai-workflow/research/same-tank-500-2026-11-10/model.json","ai-workflow/research/same-tank-500-2026-11-10/inputs.json","ai-workflow/research/same-tank-500-2026-11-10/source.json");
for(const file of researchFiles)researchHashes[file]=await sourceHash(file);
await fs.writeFile("app/lib/research-build.json",JSON.stringify({sourceHash:`sha256:${createHash("sha256").update(JSON.stringify(researchHashes)).digest("hex")}`,files:researchHashes},null,2)+"\n");
// Task 2 has an independent identity; existing Task 1 replay hashes are preserved.
const hrtStudyFiles=["app/lib/hrt-optimization.ts","app/lib/hrt-optimization-execution.ts","app/api/research/hrt-optimization/route.ts","ai-workflow/research/hrt-optimization-2026-11-08/source-manifest.json","ai-workflow/research/hrt-optimization-2026-11-08/scenarios.json","ai-workflow/research/hrt-optimization-2026-11-08/model-assessment.json"];
const hrtStudyHashes={};
for(const file of hrtStudyFiles)hrtStudyHashes[file]=await sourceHash(file);
await fs.writeFile("app/lib/hrt-optimization-build.json",JSON.stringify({sourceHash:`sha256:${createHash("sha256").update(JSON.stringify(hrtStudyHashes)).digest("hex")}`,files:hrtStudyHashes},null,2)+"\n");
// The expanded same-reactor study is independently versioned. Keep the original
// Task 2 and Task 1 implementations available for historical replay.
const reactorFiles=["app/lib/reactor-optimization.ts","app/lib/reactor-optimization-execution.ts","app/api/research/reactor-optimization/route.ts","ai-workflow/research/reactor-study-2026-11-09/source-manifest.json","ai-workflow/research/reactor-study-2026-11-09/scenarios.json","ai-workflow/research/reactor-study-2026-11-09/model.json","ai-workflow/research/reactor-study-2026-11-09/model-assessment.json"];
reactorFiles.push("app/lib/reactor-source-reference.ts","ai-workflow/research/reactor-study-2026-11-09/merged-workbook-data.json");
const reactorHashes={};for(const file of reactorFiles)reactorHashes[file]=await sourceHash(file);
await fs.writeFile("app/lib/reactor-optimization-build.json",JSON.stringify({sourceHash:`sha256:${createHash("sha256").update(JSON.stringify(reactorHashes)).digest("hex")}`,files:reactorHashes},null,2)+"\n");
const reactorSearchFiles=[...reactorFiles,"app/lib/reactor-scenario-generator.ts","app/lib/reactor-search.ts","app/lib/reactor-search-execution.ts","app/api/research/reactor-search/route.ts"];
const reactorSearchHashes={};for(const file of reactorSearchFiles)reactorSearchHashes[file]=await sourceHash(file);
await fs.writeFile("app/lib/reactor-search-build.json",JSON.stringify({sourceHash:`sha256:${createHash("sha256").update(JSON.stringify(reactorSearchHashes)).digest("hex")}`,files:reactorSearchHashes},null,2)+"\n");
