"""Run the deployed ONNX models outside AQUAIVOLT and compare saved API output.

python independent-model-check.py --models models --request request.json --expected live-response.json
Requires numpy and onnxruntime. No application server or credentials are needed.
"""
import argparse, hashlib, json
from pathlib import Path
import numpy as np
import onnxruntime as ort

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--models",type=Path,required=True)
    parser.add_argument("--request",type=Path,required=True)
    parser.add_argument("--expected",type=Path)
    parser.add_argument("--output",type=Path)
    args=parser.parse_args()
    registry=json.loads((args.models/"manifest.json").read_text(encoding="utf-8"))
    request=json.loads(args.request.read_text(encoding="utf-8"))
    inputs=request["operatingConditions"]
    expected=json.loads(args.expected.read_text(encoding="utf-8")) if args.expected else None
    if expected and "record" in expected:
        expected=expected["record"]["response"]
    results=[]
    for key,model in registry["models"].items():
        artifact=args.models/model["filename"]
        digest="sha256:"+hashlib.sha256(artifact.read_bytes()).hexdigest()
        if digest!=model["artifactHash"]: raise SystemExit("Artifact SHA-256 mismatch: "+key)
        options=ort.SessionOptions()
        options.intra_op_num_threads=1
        options.inter_op_num_threads=1
        options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
        session=ort.InferenceSession(str(artifact),sess_options=options,providers=["CPUExecutionProvider"])
        feeds={}
        for feature in model["features"]:
            value=inputs[feature["key"]]
            if value is None: raise SystemExit("Null trained input: "+feature["key"])
            feeds[feature["tensor"]]=np.array([[value]],dtype=object if feature["type"]=="string" else np.float64)
        values=np.asarray(session.run([model["outputName"]],feeds)[0]).reshape(-1)
        if len(values)!=3 or not np.isfinite(values).all(): raise SystemExit("Invalid model output")
        raw=dict(zip(["gasFlowM3h","methanePct","generatorKw"],map(float,values)))
        comparison=None
        if expected:
            live=next(p for p in expected["predictions"] if p["modelId"]==key)
            if live["artifactHash"]!=digest: raise SystemExit("Live artifact differs: "+key)
            if expected["effectiveInputs"]!=inputs: raise SystemExit("Submitted inputs differ from saved live run")
            tol=registry["parityTolerance"]
            comparison={k:{"local":v,"live":live["raw"][k],"absoluteDifference":abs(v-live["raw"][k]),"passed":bool(np.isclose(v,live["raw"][k],atol=tol["absolute"],rtol=tol["relative"]))} for k,v in raw.items()}
            if not all(c["passed"] for c in comparison.values()): raise SystemExit("Prediction mismatch: "+json.dumps(comparison))
        results.append({"modelId":key,"artifactHash":digest,"raw":raw,"comparison":comparison})
    output={"runtime":ort.__version__,"provider":"CPUExecutionProvider","status":"PASS" if expected else "EXECUTED_NOT_COMPARED","predictions":results,"scope":"Artifact and execution parity only; not predictive accuracy or plant validation."}
    text=json.dumps(output,indent=2)
    if args.output: args.output.write_text(text,encoding="utf-8")
    print(text)
if __name__=="__main__": main()
