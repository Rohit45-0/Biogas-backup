"""Fit pathway-specific exploratory Ridge models with grouped holdout assessment.

Original scenario numbers are split groups, never features: related rows from
the two source versions cannot cross a training/validation boundary.
"""
from pathlib import Path
import json
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"ai-workflow/research/reactor-study-2026-11-09"
SEED=20261109
FEATURES=["hrtHours","srtDays","temperatureC","ph","upflowMHour"]
TARGETS=["biogasM3Day","methanePct"]
ALPHAS=[.1,1.,10.,100.,1000.]

def save(name,value):
    (OUT/name).write_text(json.dumps(value,indent=2,allow_nan=False)+"\n",encoding="utf-8")

def fit(x,y,alpha):
    mean=x.mean(0);scale=x.std(0);scale[scale<1e-10]=1
    z=np.column_stack([np.ones(len(x)),(x-mean)/scale]);penalty=np.eye(z.shape[1])*alpha;penalty[0,0]=0
    return dict(mean=mean.tolist(),scale=scale.tolist(),coefficients=np.linalg.solve(z.T@z+penalty,z.T@y).tolist(),alpha=alpha)

def predict(model,x):
    return np.column_stack([np.ones(len(x)),(x-np.array(model["mean"]))/np.array(model["scale"])])@np.array(model["coefficients"])

def metrics(actual,predicted):
    scores={}
    for name,a,p in [("biogasM3Day",actual[:,0],predicted[:,0]),("methanePct",actual[:,1],predicted[:,1]),
                      ("methaneM3Day",actual[:,0]*actual[:,1]/100,predicted[:,0]*predicted[:,1]/100),
                      ("electricityKwhDay",actual[:,0]*actual[:,1]/100*3.5892,predicted[:,0]*predicted[:,1]/100*3.5892)]:
        denominator=float(np.sum((a-a.mean())**2))
        scores[name]=dict(mae=float(np.abs(a-p).mean()),r2=float(1-np.sum((a-p)**2)/denominator) if denominator>1e-15 else None)
    return scores

def main():
    rows=json.loads((OUT/"scenarios.json").read_text())
    pathways=sorted({row["pathway"] for row in rows})
    arrays={}
    for pathway in pathways:
        indices=np.array([i for i,row in enumerate(rows) if row["pathway"]==pathway])
        keys=FEATURES+([] if pathway.startswith("C") else ["olr"])
        arrays[pathway]=(indices,keys,np.array([[rows[i][key] for key in keys] for i in indices]),np.array([[rows[i]["outputs"][key] for key in TARGETS] for i in indices]))

    def train_group(train_ids):
        models={}
        for pathway,(indices,keys,x,y) in arrays.items():
            local=np.array([j for j,i in enumerate(indices) if int(i) in train_ids])
            groups=sorted({rows[int(indices[j])]["sourceScenario"] for j in local})
            np.random.default_rng(SEED).shuffle(groups)
            fold_for={group:index%5 for index,group in enumerate(groups)}
            trials=[]
            for alpha in ALPHAS:
                losses=[]
                for fold in range(5):
                    fitting=np.array([j for j in local if fold_for[rows[int(indices[j])]["sourceScenario"]]!=fold])
                    validation=np.array([j for j in local if fold_for[rows[int(indices[j])]["sourceScenario"]]==fold])
                    if len(validation)==0:continue
                    prediction=predict(fit(x[fitting],y[fitting],alpha),x[validation])
                    scale=np.maximum(y[fitting].std(0),1e-9)
                    losses.append(float(np.mean(np.abs(y[validation]-prediction)/scale)))
                trials.append(dict(alpha=alpha,normalizedMae=float(np.mean(losses))))
            alpha=min(trials,key=lambda trial:trial["normalizedMae"])["alpha"]
            models[pathway]={"features":keys,"trainingRows":len(local),"trainingIds":[rows[int(indices[j])]["id"] for j in local],
                "crossValidation":trials,"fit":fit(x[local],y[local],alpha)}
        return models

    def evaluate(train,test):
        models=train_group(set(train));all_actual=[];all_pred=[];all_mean=[];by_pathway={}
        for pathway,(indices,keys,x,y) in arrays.items():
            fitting=np.array([j for j,i in enumerate(indices) if int(i) in train])
            testing=np.array([j for j,i in enumerate(indices) if int(i) in test])
            if not len(testing):continue
            predicted=predict(models[pathway]["fit"],x[testing]);reference=np.repeat(y[fitting].mean(0)[None,:],len(testing),axis=0)
            all_actual.extend(y[testing]);all_pred.extend(predicted);all_mean.extend(reference)
            by_pathway[pathway]=dict(trainRows=len(fitting),testRows=len(testing),ridge=metrics(y[testing],predicted),technologyMean=metrics(y[testing],reference))
        return dict(trainRows=len(train),testRows=len(test),trainScenarioIds=[rows[i]["id"] for i in sorted(train)],testScenarioIds=[rows[i]["id"] for i in sorted(test)],
            trainGroups=sorted({rows[i]["sourceScenario"] for i in train}),testGroups=sorted({rows[i]["sourceScenario"] for i in test}),
            ridge=metrics(np.array(all_actual),np.array(all_pred)),technologyMean=metrics(np.array(all_actual),np.array(all_mean)),byPathway=by_pathway)

    ids=np.arange(1,201);np.random.default_rng(SEED).shuffle(ids);test_groups=set(ids[:40])
    random_test=evaluate({i for i,r in enumerate(rows) if r["sourceScenario"] not in test_groups},{i for i,r in enumerate(rows) if r["sourceScenario"] in test_groups})
    ordered_test=evaluate({i for i,r in enumerate(rows) if r["sourceScenario"]<=160},{i for i,r in enumerate(rows) if r["sourceScenario"]>160})
    performance=all(split["ridge"][key]["r2"] is not None and split["ridge"][key]["r2"]>0 and split["ridge"][key]["mae"]<split["technologyMean"][key]["mae"] for split in [random_test,ordered_test] for key in ["biogasM3Day","methanePct","methaneM3Day"])
    models=train_group(set(range(400)))
    artifact=dict(version="same-reactor-ridge-2026-11-09-v1",algorithm="Per-reactor standardized Ridge regression",trainingRows=400,seed=SEED,targets=TARGETS,
        models=models,scope="EXPLORATORY_SOURCE_INPUTS_ONLY",generatedInputsEnabled=False,
        definition="Fit biogas volume and methane percentage from operating inputs within each reactor pathway. Derive methane and gross electricity. Evaluate only recorded source input combinations.")
    assessment=dict(version=artifact["version"],trainingRows=400,splitUnit="Original scenario number across both source versions",seed=SEED,
        randomHoldout=random_test,orderedHoldout=ordered_test,performanceGatePassed=performance,plantValidated=False,
        prescribedBiogasGainSequence=True,generatedInputsEnabled=False,
        excludedFeatures=["Scenario IDs","Source file","BEFORE reference outputs","AFTER outcomes","Gain columns","H2S outputs","Stability index","CSTR OLR: unresolved COD/VS"],
        reason="Biogas source values follow a prescribed gain sequence. Grouped holdouts do not establish an operating-response model for plant use. Predictions are exploratory, restricted to the 400 supplied input combinations; no production gain is guaranteed.")
    save("model.json",artifact);save("model-assessment.json",assessment)
    parity=[];defaults={}
    for pathway,(indices,keys,x,y) in arrays.items():
        predictions=predict(models[pathway]["fit"],x)
        baseline=predictions[0];first=rows[int(indices[0])]
        eligible=[(rows[int(i)]["hrtHours"],rows[int(i)]["id"]) for j,i in enumerate(indices) if rows[int(i)]["hrtHours"]<first["hrtHours"] and predictions[j,0]>baseline[0]+1e-9 and predictions[j,0]*predictions[j,1]>baseline[0]*baseline[1]+1e-9]
        defaults[pathway]=dict(baseline=first["id"],hrtBefore=first["hrtHours"],eligible=len(eligible),selected=min(eligible) if eligible else None)
        for j,i in enumerate(indices):parity.append(dict(id=rows[int(i)]["id"],biogasM3Day=float(predictions[j,0]),methanePct=float(predictions[j,1])))
    save("prediction-parity.json",parity)
    print(json.dumps({"performanceGatePassed":performance,"randomHoldout":random_test["ridge"],"orderedHoldout":ordered_test["ridge"],"defaultStudies":defaults}))

if __name__=="__main__":main()
