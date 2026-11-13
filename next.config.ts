import type { NextConfig } from "next";
import path from "node:path";
import {realpathSync} from "node:fs";

// Vercel cannot package both a directory symlink and files nested under that link.
const nativeRoot=path.relative(process.cwd(),realpathSync("node_modules/onnxruntime-node")).split(path.sep).join("/");

const nextConfig: NextConfig = {
  serverExternalPackages:["onnxruntime-node"],
  outputFileTracingIncludes:{"/api/ml/*":[
    "./ai-workflow/models/onnx/*.onnx",
    "./ai-workflow/models/onnx/manifest.json",
    "./scripts/independent-model-check.py",
    "./docs/MODEL_VERIFICATION_2026-11-13.md",
    ...(process.platform==="linux"?[`./${nativeRoot}/bin/napi-v6/linux/x64/*`]:[]),
  ],"/api/research/reactor-optimization":["./ai-workflow/research/reactor-study-2026-11-09/*.xlsx","./docs/TASK2_AUDITOR_GUIDE_2026-11-09.md"],"/api/research/reactor-search":["./ai-workflow/research/reactor-study-2026-11-09/*.xlsx","./docs/TASK2_AUDITOR_GUIDE_2026-11-09.md"]},
  outputFileTracingExcludes:process.platform==="linux"?{"/*":[
    "./node_modules/onnxruntime-node/bin/napi-v6/win32/**/*",
    "./node_modules/onnxruntime-node/bin/napi-v6/darwin/**/*",
    "./node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**/*",
    "./node_modules/.pnpm/onnxruntime-node*/node_modules/onnxruntime-node/bin/napi-v6/win32/**/*",
    "./node_modules/.pnpm/onnxruntime-node*/node_modules/onnxruntime-node/bin/napi-v6/darwin/**/*",
    "./node_modules/.pnpm/onnxruntime-node*/node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**/*",
  ]}:{},
};

export default nextConfig;
