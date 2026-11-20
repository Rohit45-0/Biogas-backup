"""Package only the allowlisted reference model files; no environment or credentials."""
import argparse,hashlib,json,zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--workbooks',type=Path,required=True);args=p.parse_args()
root=Path(__file__).resolve().parents[1]
files={}
for name in ['ridge.onnx','gradient_boosting.onnx','manifest.json']:files['models/'+name]=(root/'ai-workflow/models/onnx'/name).read_bytes()
registry=json.loads(files['models/manifest.json'])
for model in registry['models'].values():
    assert 'sha256:'+hashlib.sha256(files['models/'+model['filename']]).hexdigest()==model['artifactHash']
    name=Path(model['sourceArtifact']).name;data=(root/model['sourceArtifact']).read_bytes()
    assert 'sha256:'+hashlib.sha256(data).hexdigest()==model['sourceArtifactHash']
    files['models/'+name]=data
for name in ['independent-model-check.py','reproduce-reference-evaluation.py']:files[name]=(root/'scripts'/name).read_bytes()
for name in ['AQUAIVOLT_10_Biogas_Optimization_10Scenarios.xlsx','AQUAIVOLT_AI_Biogas_SCADA_Dataset_Template.xlsx']:files['source-workbooks/'+name]=(args.workbooks/name).read_bytes()
for name in ['MODEL_VERIFICATION_2026-11-20.md','PLANT_VALIDATION_PROTOCOL_2026-11-20.md','AUDITOR_RETEST_2026-11-20.md','HISTORICAL_INTEGRITY_INVESTIGATION_2026-11-20.md']:files['documentation/'+name]=(root/'docs'/name).read_bytes()
files['reference-evaluation.json']=(root/'ai-workflow/evaluation/reference-reconstruction-2026-11-20.json').read_bytes()
files['archived-model-comparison.json']=(root/'ai-workflow/evaluation/model_comparison.json').read_bytes()
files['export_onnx_models.py']=(root/'ai-workflow/src/export_onnx_models.py').read_bytes()
files['requirements-check.txt']=b'numpy==2.3.5\nonnxruntime==1.23.2\n'
files['requirements-reference-evaluation.txt']=b'numpy==2.3.5\npandas==3.0.1\nscikit-learn==1.9.0\njoblib==1.5.3\nopenpyxl==3.1.5\n'
files['request.json']=json.dumps({'operatingConditions':{'feedstock':'Dairy WW','feedRate':846,'temperature':36.5,'ph':7.2,'olr':3.2,'hrt':22,'codIn':7600,'vfa':1100,'mixing':50}},indent=2).encode()
files['README.txt']=b'''AQUAIVOLT exact model verification package - 20 November 2026
Models are unchanged. Both ONNX artifacts and original fitted pipelines are included.
Use Python 3.12. Install requirements-check.txt for inference.
Save a live /api/ml/predict response for request.json as response.json.
python independent-model-check.py --models models --request request.json --expected response.json --output comparison.json
For reference training/evaluation reconstruction, install requirements-reference-evaluation.txt:
python reproduce-reference-evaluation.py --models models --workbooks source-workbooks --output recreated-evaluation.json
Read documentation/MODEL_VERIFICATION_2026-11-20.md for features, units, targets, preprocessing, split rules, evaluation and limits.
Live serving source/deployment identity: authenticated GET /api/ml/artifacts.
That source revision identifies serving code, not the unrecovered original training transaction.
CHECKSUMS.json covers all files except itself. Compare ONNX hashes with live API results.
The reconstructed procedure reproduces the saved fits and archived metrics; it is not independent plant validation.
'''
files['CHECKSUMS.json']=json.dumps({k:hashlib.sha256(v).hexdigest() for k,v in sorted(files.items())},indent=2).encode()
out=root/'release-assets/AQUAIVOLT-Model-Verification-2026-11-20.zip';out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for name,data in sorted(files.items()):
        info=zipfile.ZipInfo(name,date_time=(2026,11,20,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
print(json.dumps({'file':str(out),'files':len(files),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size}))
