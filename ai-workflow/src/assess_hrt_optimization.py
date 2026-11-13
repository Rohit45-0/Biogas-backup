"""Leakage-free NumPy ridge assessment; a failed gate keeps source ranking active.

Hyperparameters are chosen by cross-validation inside the training split. The
random held-out and ordered last-20% results are not used for model selection.
"""
import json
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parents[2] / "ai-workflow/research/hrt-optimization-2026-11-08"
FEATURES = ["hrtHours", "srtDays", "temperatureC", "ph", "upflowMHour"]
TARGETS = ["biogasM3Day", "methanePct"]
SEED = 20261108


def save(name, data):
    (OUT/name).write_text(json.dumps(data, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def fit(x, y, alpha):
    mean, scale = x.mean(axis=0), x.std(axis=0)
    scale[scale < 1e-10] = 1
    z = np.column_stack([np.ones(len(x)), (x-mean)/scale])
    penalty = np.eye(z.shape[1]) * alpha
    penalty[0, 0] = 0
    coef = np.linalg.solve(z.T @ z + penalty, z.T @ y)
    return {"mean": mean.tolist(), "scale": scale.tolist(), "coefficients": coef.tolist(), "alpha": alpha}


def predict(model, x):
    return np.column_stack([np.ones(len(x)), (x-np.array(model["mean"]))/np.array(model["scale"])]) @ np.array(model["coefficients"])


def metrics(y, pred):
    result = {}
    # Electricity is exactly proportional to methane under this assumption.
    for key, actual, fitted in [("biogasM3Day", y[:, 0], pred[:, 0]),
                                ("methanePct", y[:, 1], pred[:, 1]),
                                ("methaneM3Day", y[:, 0]*y[:, 1]/100, pred[:, 0]*pred[:, 1]/100),
                                ("electricityKwhDay", y[:, 0]*y[:, 1]/100*3.5892, pred[:, 0]*pred[:, 1]/100*3.5892)]:
        result[key] = dict(mae=float(np.abs(actual-fitted).mean()),
                           r2=float(1-np.sum((actual-fitted)**2)/np.sum((actual-actual.mean())**2)))
    return result


def split_by_pathway(indices, groups, rng, fraction=.2):
    train, test = [], []
    for group in sorted(set(groups)):
        selected = np.array([i for i in indices if groups[i] == group])
        rng.shuffle(selected)
        n = max(1, round(len(selected)*fraction))
        test.extend(selected[:n]); train.extend(selected[n:])
    return np.array(sorted(train)), np.array(sorted(test))


def main():
    rows = json.loads((OUT/"scenarios.json").read_text(encoding="utf-8"))
    groups = [r["pathway"] for r in rows]
    pathways = sorted(set(groups))
    # OLR is deliberately excluded for all rows because CSTR COD/VS is unresolved.
    x = np.array([[float(r["pathway"] == p) for p in pathways] + [r[f] for f in FEATURES] for r in rows])
    y = np.array([[r["outputs"][t] for t in TARGETS] for r in rows])
    rng = np.random.default_rng(SEED)
    train, test = split_by_pathway(np.arange(len(rows)), groups, rng)
    def select_alpha(training):
        # Each outer split gets its own inner CV; ordered holdout rows never
        # influence the ordered test's hyperparameter choice.
        fold_rng = np.random.default_rng(SEED)
        folds = [[] for _ in range(5)]
        for group in pathways:
            selected = np.array([i for i in training if groups[i] == group]); fold_rng.shuffle(selected)
            for index, item in enumerate(selected): folds[index % 5].append(int(item))
        trials = []
        for alpha in [.1, 1, 10, 100, 1000]:
            losses = []
            for validation in folds:
                fitting = np.array([i for i in training if i not in validation])
                prediction = predict(fit(x[fitting], y[fitting], alpha), x[validation])
                losses.append(float(np.mean(np.abs(y[validation]-prediction)/np.std(y[fitting], axis=0))))
            trials.append(dict(alpha=alpha, cvNormalizedMae=float(np.mean(losses))))
        return min(trials, key=lambda t: t["cvNormalizedMae"])["alpha"], trials

    alpha, trials = select_alpha(train)

    def evaluate(train_ids, test_ids, selected_alpha):
        fitted = predict(fit(x[train_ids], y[train_ids], selected_alpha), x[test_ids])
        group_prediction = np.array([y[[j for j in train_ids if groups[j] == groups[i]]].mean(axis=0) for i in test_ids])
        mean_prediction = np.repeat(y[train_ids].mean(axis=0)[None, :], len(test_ids), axis=0)
        return dict(trainRows=len(train_ids), testRows=len(test_ids), selectedAlpha=selected_alpha,
                    trainScenarioIds=[rows[i]["id"] for i in train_ids], testScenarioIds=[rows[i]["id"] for i in test_ids],
                    ridge=metrics(y[test_ids], fitted), technologyMean=metrics(y[test_ids], group_prediction),
                    globalMean=metrics(y[test_ids], mean_prediction))

    random_test = evaluate(train, test, alpha)
    ordered_alpha, ordered_trials = select_alpha(np.arange(160))
    ordered_test = evaluate(np.arange(160), np.arange(160, 200), ordered_alpha)
    ordered_test["crossValidation"] = ordered_trials
    performance_passed = all(split["ridge"][target]["r2"] > 0 and
                             split["ridge"][target]["mae"] < .95*min(split["technologyMean"][target]["mae"], split["globalMean"][target]["mae"])
                             for split in [random_test, ordered_test] for target in ["biogasM3Day", "methanePct", "methaneM3Day"])
    ordered_gains = np.array([(r["outputs"]["biogasM3Day"]/66.15-1)*100 for r in rows])
    prescribed_gains = np.linspace(40, 50, 200)
    constructed_targets = bool(np.max(np.abs(ordered_gains-prescribed_gains)) < .02)
    assessment = dict(seed=SEED, trainingRows=200, features=["pathway one-hot"]+FEATURES,
                      excludedFeatures=["scenario ID", "OLR (unresolved COD/VS)", "AFTER outcomes", "gains", "H2S", "stability", "source URL"],
                      targetFields=TARGETS, selectedAlpha=alpha, crossValidation=trials,
                      randomHoldout=random_test, orderedHoldout=ordered_test,
                      performanceGatePassed=performance_passed, prescribedBiogasGainSequence=constructed_targets,
                      allowGeneratedCandidates=bool(performance_passed and not constructed_targets),
                      activeMethod="SOURCE_SCENARIO_RANKING", evaluatedSourceRows=200,
                      reason="The workbook prescribes the biogas gain sequence; held-out tests do not establish a reliable operating-input response. Use the 200 original planning scenarios, not 2,000 claimed model predictions.")
    save("model-assessment.json", assessment)
    save("assessed-ridge.json", dict(version="hrt-ridge-assessment-2026-11-08-v1", deployable=False,
                                     pathways=pathways, features=FEATURES, targets=TARGETS, model=fit(x, y, alpha)))
    print(json.dumps({"alpha": alpha, "allowGeneratedCandidates": assessment["allowGeneratedCandidates"],
                      "randomHoldout": random_test["ridge"], "orderedHoldout": ordered_test["ridge"]}))


if __name__ == "__main__":
    main()
