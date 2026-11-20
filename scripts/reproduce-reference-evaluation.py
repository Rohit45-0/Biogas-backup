"""Reconstruct and assess archived reference-data fits without replacing live models.

This is a new reproducibility script, not a recovered historical training commit.
Only load the trusted fitted pipelines whose hashes match the supplied registry.
"""
import argparse,hashlib,json
from pathlib import Path
import joblib,numpy as np,pandas as pd,sklearn
from sklearn.base import clone
from sklearn.metrics import mean_absolute_error,mean_squared_error,r2_score

parser=argparse.ArgumentParser()
parser.add_argument('--models',type=Path,required=True)
parser.add_argument('--workbooks',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
manifest=json.loads((args.models/'manifest.json').read_text())
configs=[('gradient_boosting','AQUAIVOLT_10_Biogas_Optimization_10Scenarios.xlsx','10_Optimization_Scenarios',['Gas Flow (m3/h) After AI','CH4 (%) After AI','Generator (kW) After AI']),('ridge','AQUAIVOLT_AI_Biogas_SCADA_Dataset_Template.xlsx','SCADA_Data',['Gas_Flow_m3h','CH4_pct','Generator_kW'])]
results=[]
for ident,filename,sheet,targets in configs:
    spec=manifest['models'][ident]
    modelpath=args.models/Path(spec['sourceArtifact']).name
    assert 'sha256:'+hashlib.sha256(modelpath.read_bytes()).hexdigest()==spec['sourceArtifactHash']
    fitted=joblib.load(modelpath)
    file=args.workbooks/filename
    frame=pd.read_excel(file,sheet_name=sheet)
    features=list(fitted.feature_names_in_)
    x=frame[features];y=frame[targets].to_numpy(dtype=float)
    assert len(frame)==(10 if ident=='gradient_boosting' else 1000)
    if ident=='ridge':assert pd.to_datetime(frame['Timestamp']).is_monotonic_increasing
    assert np.isfinite(x.select_dtypes(include='number').to_numpy()).all() and np.isfinite(y).all()
    train=np.arange(10 if ident=='gradient_boosting' else 800)
    # clone removes fitted state; fit preprocessing inside each training partition.
    reconstructed=clone(fitted).fit(x.iloc[train],y[train])
    old=fitted.predict(x);new=reconstructed.predict(x)
    difference=float(np.max(np.abs(old-new)))
    parity=bool(np.allclose(old,new,atol=1e-8,rtol=1e-8))
    rows=[]
    if ident=='gradient_boosting':
        prediction=np.zeros_like(y);mean=np.zeros_like(y)
        for index in range(len(x)):
            take=np.arange(len(x))!=index
            prediction[index]=clone(fitted).fit(x.loc[take],y[take]).predict(x.iloc[[index]])[0]
            mean[index]=y[take].mean(axis=0)
        actual=y;indices=np.arange(len(x));method='Leave one entire reference row out; refit preprocessing and estimator inside each fold'
    else:
        indices=np.arange(800,1000);actual=y[indices];prediction=old[indices]
        mean=np.tile(y[:800].mean(axis=0),(200,1));method='Archived saved pipeline on final 200 chronological rows; first 800 used for fit reconstruction'
    metrics=[]
    for j,name in enumerate(targets):
        metrics.append({'target':name,'mae':float(mean_absolute_error(actual[:,j],prediction[:,j])),'rmse':float(np.sqrt(mean_squared_error(actual[:,j],prediction[:,j]))),'r2':float(r2_score(actual[:,j],prediction[:,j])),'trainingMeanBaselineMAE':float(mean_absolute_error(actual[:,j],mean[:,j]))})
    for i,index in enumerate(indices):rows.append({'dataRow':int(index)+1,'worksheetRow':int(index)+2,'actual':actual[i].tolist(),'predicted':prediction[i].tolist(),'trainingMeanBaseline':mean[i].tolist()})
    results.append({'model':ident,'sourceWorkbook':filename,'sourceSHA256':hashlib.sha256(file.read_bytes()).hexdigest(),'sourceArtifactHash':spec['sourceArtifactHash'],'features':features,'targets':targets,'fitRows':len(train),'evaluationRows':len(indices),'method':method,'refitMatchesSavedArtifactPredictions':parity,'refitMaximumAbsoluteDifference':difference,'metrics':metrics,'rows':rows})
output={'version':'reference-reconstruction-2026-11-20','sklearn':sklearn.__version__,'scope':'Reconstructed reference-data fitting and evaluation. This does not recover the original training transaction or establish independent plant accuracy. No live artifact is changed.','results':results}
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(output,indent=2,allow_nan=False)+'\n')
print(json.dumps([{k:r[k] for k in ['model','fitRows','evaluationRows','refitMatchesSavedArtifactPredictions','refitMaximumAbsoluteDifference','metrics']} for r in results],indent=2))
