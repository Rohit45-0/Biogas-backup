"""Train an isolated study on the 200-row workbook and evaluate 2,000 candidates.

No deployment or existing model is modified. AFTER outputs are learned from process
inputs; scenario IDs, declared gains and other AFTER outcomes are never features.
The source's constant BEFORE reference and a separate HRT-only model baseline are
both reported. The latter is exploratory, not a newly learned untreated response.
"""
import argparse
import csv
import hashlib
import json
import platform
from pathlib import Path

import joblib
import numpy as np
import sklearn
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.multioutput import MultiOutputRegressor
from sklearn.neighbors import KNeighborsRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

SEED = 20261107
FEATURES = ["Pathway", "HRT (h)", "Temp (C)", "pH", "Feed (kg VS/d)", "OLR (kg VS/m3/d)"]
TARGETS = ["AFTER Biogas (m3/d)", "CH4 (%)"]
OUTPUTS = ["biogas_m3_day", "methane_m3_day", "electricity_kwh_day"]
ENERGY_FACTOR = 9.97 * 0.36


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")


def write_csv(path, rows):
    with path.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def model_candidates():
    preprocessing = ColumnTransformer([
        ("pathway", OneHotEncoder(handle_unknown="error", sparse_output=False), [0]),
        ("numeric", StandardScaler(), [1, 2, 3, 4, 5]),
    ])
    learners = [("Mean benchmark", DummyRegressor(strategy="mean"))]
    learners += [(f"Ridge {alpha}", Ridge(alpha=alpha)) for alpha in [0.1, 1, 10, 100, 1000]]
    learners += [
        ("KNN 15", KNeighborsRegressor(n_neighbors=15, weights="distance")),
        ("Random forest", RandomForestRegressor(n_estimators=120, min_samples_leaf=5,
                                               max_depth=6, random_state=SEED, n_jobs=2)),
        ("Extra Trees", ExtraTreesRegressor(n_estimators=120, min_samples_leaf=5,
                                           max_depth=6, random_state=SEED, n_jobs=2)),
        ("Gradient boosting", MultiOutputRegressor(GradientBoostingRegressor(
            n_estimators=100, max_depth=2, min_samples_leaf=5, learning_rate=0.04,
            random_state=SEED))),
    ]
    return [(name, make_pipeline(clone(preprocessing), model)) for name, model in learners]


def expanded_outputs(prediction):
    gas, fraction = prediction[:, 0], prediction[:, 1]
    assert np.isfinite(prediction).all() and (gas > 0).all()
    assert ((fraction > 0) & (fraction < 100)).all()
    methane = gas * fraction / 100
    return np.column_stack([gas, methane, methane * ENERGY_FACTOR])


def hrt_baseline(hours, model):
    support = model["input"]
    assert ((hours >= support["min"]) & (hours <= support["max"])).all()
    assert model["basis"]["kind"] == "polynomial"
    scaled = (hours - support["offset"]) / support["scale"]
    basis = np.column_stack([scaled ** degree for degree in range(model["basis"]["degree"] + 1)])
    predicted = np.column_stack([basis @ np.asarray(model["coefficients"][key])
                                 for key in ["biogasM3Day", "methanePct"]])
    return expanded_outputs(predicted)


def assess(truth, prediction):
    return {key: {"mae": float(mean_absolute_error(truth[:, i], prediction[:, i])),
                  "r2": float(r2_score(truth[:, i], prediction[:, i]))}
            for i, key in enumerate(OUTPUTS)}


def generate_candidates(x, source_ids, support):
    numeric = x[:, 1:].astype(float)
    allowed = (numeric[:, 0] >= support["min"]) & (numeric[:, 0] <= support["max"])
    ids = np.flatnonzero(allowed)
    candidates = [list(x[i]) for i in ids]
    provenance = [{"kind": "source_input", "parent_a": int(source_ids[i]),
                   "parent_b": int(source_ids[i]), "weight_b": 0.0} for i in ids]
    rng = np.random.default_rng(SEED)
    pathways = sorted(set(x[:, 0]))
    while len(candidates) < 2000:
        pathway = pathways[(len(candidates) - len(ids)) % len(pathways)]
        same = ids[x[ids, 0] == pathway]
        first = int(rng.choice(same))
        scales = np.maximum(np.ptp(numeric[same], axis=0), 1e-8)
        distances = np.linalg.norm((numeric[same] - numeric[first]) / scales, axis=1)
        nearby = same[np.argsort(distances)[1:7]]
        second = int(rng.choice(nearby))
        weight = float(rng.uniform(0.05, 0.95))
        point = numeric[first] * (1 - weight) + numeric[second] * weight
        candidates.append([pathway, *point.tolist()])
        provenance.append({"kind": "same_pathway_interpolation", "parent_a": int(source_ids[first]),
                           "parent_b": int(source_ids[second]), "weight_b": weight})
    result = np.array(candidates, dtype=object)
    assert len({tuple(row) for row in result}) == 2000
    return result, provenance, int((~allowed).sum())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-json", type=Path, required=True)
    parser.add_argument("--baseline-model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    source = json.loads(args.source_json.read_text(encoding="utf-8"))
    rows = source["rows"]
    x = np.array([[row[key] for key in FEATURES] for row in rows], dtype=object)
    y = np.array([[row[key] for key in TARGETS] for row in rows], dtype=float)
    source_ids = np.array([row["Scenario"] for row in rows])
    before = np.array([[row[f"BEFORE {key}"] for key in
                       ["Biogas (m3/d)", "Methane (m3/d)", "Electricity (kWh/d)"]] for row in rows])
    observed_after = np.array([[row[f"AFTER {key}"] for key in
                               ["Biogas (m3/d)", "Methane (m3/d)", "Electricity (kWh/d)"]] for row in rows])
    assert x.shape == (200, 6) and np.isfinite(y).all() and np.unique(before, axis=0).shape[0] == 1
    source_gains = (observed_after / before - 1) * 100
    gas_id_corr = float(np.corrcoef(source_ids, y[:, 0])[0, 1])
    train, test = train_test_split(np.arange(200), test_size=0.2, stratify=x[:, 0], random_state=SEED)
    folds = list(StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED).split(train, x[train, 0]))
    candidates = model_candidates()
    leaderboard = []
    for name, model in candidates:
        errors = []
        for fit_local, valid_local in folds:
            fit, valid = train[fit_local], train[valid_local]
            predicted = clone(model).fit(x[fit], y[fit]).predict(x[valid])
            scale = np.maximum(np.std(y[fit], axis=0), 1e-8)
            errors.append(float(np.mean(np.abs(predicted - y[valid]) / scale)))
        leaderboard.append({"name": name, "cv_normalized_mae": float(np.mean(errors)), "folds": errors})
        print(json.dumps({"cv": leaderboard[-1]}), flush=True)
    leaderboard.sort(key=lambda record: record["cv_normalized_mae"])
    selected = next(record for record in leaderboard if record["name"] != "Mean benchmark")
    selected_model = dict(candidates)[selected["name"]]
    benchmark = dict(candidates)["Mean benchmark"]
    holdout_model = clone(selected_model).fit(x[train], y[train])
    holdout_prediction = expanded_outputs(holdout_model.predict(x[test]))
    benchmark_prediction = expanded_outputs(clone(benchmark).fit(x[train], y[train]).predict(x[test]))
    # A secondary row-order holdout detects the preset scenario-ID gain sweep.
    blocked = clone(selected_model).fit(x[:160], y[:160])
    blocked_prediction = expanded_outputs(blocked.predict(x[160:]))
    fitted = clone(selected_model).fit(x, y)
    model_path = args.output / "paired-after-model.joblib"
    joblib.dump(fitted, model_path)
    restored = joblib.load(model_path)
    baseline_model = json.loads(args.baseline_model.read_text(encoding="utf-8"))
    scenario_inputs, provenance, excluded = generate_candidates(x, source_ids, baseline_model["input"])
    predicted_raw = restored.predict(scenario_inputs)
    assert np.allclose(predicted_raw, fitted.predict(scenario_inputs), rtol=0, atol=1e-12)
    after = expanded_outputs(predicted_raw)
    dynamic_before = hrt_baseline(scenario_inputs[:, 1].astype(float), baseline_model)
    fixed_before = before[0]
    gains_dynamic = (after / dynamic_before - 1) * 100
    gains_fixed = (after / fixed_before - 1) * 100
    assert np.ptp(dynamic_before[:, 0]) > 0 and np.ptp(dynamic_before[:, 1]) > 0
    # Rank by the weakest of the three gains, avoiding a large gain hiding a loss.
    order = np.lexsort((-gains_dynamic[:, 2], -gains_dynamic.min(axis=1)))
    exported = []
    for rank, index in enumerate(order, 1):
        row = {"rank": rank, "candidate_id": f"PAIR-{index + 1:04d}", "pathway": scenario_inputs[index, 0],
               "intervention": next(r["Intervention"] for r in rows if r["Pathway"] == scenario_inputs[index, 0]),
               "hrt_hours": float(scenario_inputs[index, 1]), "temperature_c": float(scenario_inputs[index, 2]),
               "ph": float(scenario_inputs[index, 3]), "feed_kg_vs_day": float(scenario_inputs[index, 4]),
               "olr_kg_vs_m3_day": float(scenario_inputs[index, 5]),
               **provenance[index]}
        for j, key in enumerate(OUTPUTS):
            row[f"hrt_baseline_{key}"] = float(dynamic_before[index, j])
            row[f"predicted_after_{key}"] = float(after[index, j])
            row[f"gain_vs_hrt_baseline_{key}_pct"] = float(gains_dynamic[index, j])
            row[f"workbook_baseline_{key}"] = float(fixed_before[j])
            row[f"gain_vs_workbook_baseline_{key}_pct"] = float(gains_fixed[index, j])
        row.update(predicted_methane_pct=float(predicted_raw[index, 1]),
                   minimum_gain_pct=float(gains_dynamic[index].min()),
                   all_three_above_50=bool((gains_dynamic[index] > 50).all()),
                   all_three_above_50_workbook_baseline=bool((gains_fixed[index] > 50).all()),
                   baseline_basis="existing_hours_model_same_HRT_exploratory_cross_model",
                   baseline_sensitive_to="HRT only", model_name=selected["name"],
                   data_role="model_predictions_from_simulated_source_not_plant_measurements")
        exported.append(row)
    write_csv(args.output / "all_2000_scenarios.csv", exported)
    write_csv(args.output / "best_20_scenarios.csv", exported[:20])
    source_rank = np.argsort(-source_gains.min(axis=1))
    source_best = [{"scenario": int(source_ids[i]), "pathway": str(x[i, 0]),
                    "inputs": dict(zip(FEATURES, list(x[i]))), "before": before[i].tolist(),
                    "after": observed_after[i].tolist(), "gains_pct": source_gains[i].tolist()}
                   for i in source_rank[:5]]
    readme = {
        "source": source["source"], "version": "paired-200-study-2026-11-07",
        "source_rows": len(rows), "candidate_count": 2000,
        "source_constant_before": dict(zip(OUTPUTS, fixed_before.tolist())),
        "source_before_unique_rows": 1, "source_all_three_above_50_count": int((source_gains > 50).all(axis=1).sum()),
        "scenario_id_biogas_correlation": gas_id_corr, "features": FEATURES, "targets": TARGETS,
        "excluded_features": [key for key in source["headers"] if key not in FEATURES],
        "selected_learner": selected["name"], "best_cv_strategy": leaderboard[0]["name"],
        "cv_ranking": leaderboard, "test_rows": 40, "development_rows": 160,
        "split_seed": SEED, "train_ids": source_ids[train].tolist(), "test_ids": source_ids[test].tolist(),
        "holdout": assess(observed_after[test], holdout_prediction),
        "mean_benchmark_holdout": assess(observed_after[test], benchmark_prediction),
        "row_order_diagnostic_rows_161_200": assess(observed_after[160:], blocked_prediction),
        "row_order_diagnostic_note": "Additional stress test, not independent model selection; hyperparameters were selected in the primary development split.",
        "energy_factor_kwh_per_m3_methane": ENERGY_FACTOR,
        "derived_vs_source_max_absolute_error": dict(zip(OUTPUTS, np.max(np.abs(expanded_outputs(y) - observed_after), axis=0).tolist())),
        "dynamic_baseline": {"model": baseline_model["version"],
            "sha256": hashlib.sha256(args.baseline_model.read_bytes()).hexdigest(),
            "responsive_inputs": ["HRT (h)"], "support_hours": [baseline_model["input"]["min"], baseline_model["input"]["max"]]},
        "candidate_generation": "Original supported inputs plus seeded convex interpolation between same-pathway nearby rows. No new observations.",
        "source_rows_excluded_from_candidate_pool_due_to_baseline_coverage": excluded,
        "all_three_above_50_dynamic_baseline": int((gains_dynamic > 50).all(axis=1).sum()),
        "all_three_above_50_workbook_baseline": int((gains_fixed > 50).all(axis=1).sum()),
        "best_candidates": exported[:5], "best_source_rows": source_best,
        "ranges": {key: {"before_min": float(dynamic_before[:, j].min()), "before_max": float(dynamic_before[:, j].max()),
                         "after_min": float(after[:, j].min()), "after_max": float(after[:, j].max())}
                   for j, key in enumerate(OUTPUTS)},
        "artifact": {"file": model_path.name, "sha256": hashlib.sha256(model_path.read_bytes()).hexdigest(),
                     "fit_rows": 200, "python": platform.python_version(), "sklearn": sklearn.__version__},
        "limitations": ["Source workbook explicitly describes simulated gains preset to 40-50%, not measured before/after data.",
            "All BEFORE labels are identical; an input-dependent untreated response cannot be learned from this workbook.",
            "Dynamic baseline uses the existing separate HRT-only model. It does not respond to temperature, pH, feed or OLR independently.",
            "Cross-model differences do not establish the causal benefit of co-digestion or pretreatment.",
            "Scenario ID drives the prescribed biogas gain sweep and is deliberately excluded from training.",
            "Candidates stay inside observed same-pathway convex combinations and the baseline HRT range, but are not validated operating recommendations.",
            "Electricity is gross production; pretreatment and operating energy costs are unavailable.",
            "No application UI, existing trained artifact, or cloud deployment was replaced."],
    }
    write_json(args.output / "study_results.json", readme)
    holdout_rows = [{"source_scenario": int(source_ids[index]), "pathway": str(x[index, 0]),
                     **{f"actual_{key}": float(observed_after[index, j]) for j, key in enumerate(OUTPUTS)},
                     **{f"predicted_{key}": float(holdout_prediction[pos, j]) for j, key in enumerate(OUTPUTS)}}
                    for pos, index in enumerate(test)]
    write_csv(args.output / "held_out_predictions.csv", holdout_rows)
    print(json.dumps({"selected": selected["name"], "best_cv_strategy": leaderboard[0]["name"],
                      "qualifying": readme["all_three_above_50_dynamic_baseline"],
                      "best": exported[0], "holdout": readme["holdout"]}), flush=True)


if __name__ == "__main__":
    main()
