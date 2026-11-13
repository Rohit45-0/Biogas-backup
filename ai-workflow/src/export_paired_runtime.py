"""Export the fitted study pipeline, without retraining or adding output gains."""
import csv
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
STUDY = ROOT / "outputs/paired-200-2026-11-07"
DEST = ROOT / "ai-workflow/research/paired-200-2026-11-07"


def write(name, data):
    (DEST / name).write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main():
    report = json.loads((STUDY / "study_results.json").read_text(encoding="utf-8"))
    pipeline = joblib.load(STUDY / "paired-after-model.joblib")
    transform, ridge = pipeline.steps[0][1], pipeline.steps[1][1]
    encoder, scaler = transform.named_transformers_["pathway"], transform.named_transformers_["numeric"]
    rows = sorted(list(csv.DictReader((STUDY / "all_2000_scenarios.csv").open(encoding="utf-8-sig"))), key=lambda row: row["candidate_id"])
    columns = ["hrt_hours", "temperature_c", "ph", "feed_kg_vs_day", "olr_kg_vs_m3_day"]
    inputs = [[row["pathway"], *[float(row[key]) for key in columns]] for row in rows]
    predicted = pipeline.predict(np.array(inputs, dtype=object))
    model = {
        "version": "paired-200-ridge-2026-11-07-v1", "learner": report["selected_learner"],
        "source": {k: v for k, v in report["source"].items() if k != "path"},
        "trainingRows": 200, "developmentRows": report["development_rows"], "testRows": report["test_rows"],
        "holdout": report["holdout"], "benchmarkHoldout": report["mean_benchmark_holdout"],
        "features": report["features"], "targets": report["targets"],
        "pathways": encoder.categories_[0].tolist(), "mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist(),
        "coefficients": ridge.coef_.tolist(), "intercept": ridge.intercept_.tolist(),
        "joblibSha256": hashlib.sha256((STUDY / "paired-after-model.joblib").read_bytes()).hexdigest(),
        "limitations": report["limitations"][:-1] + ["Held-out R² is below zero: predictions have not demonstrated accuracy beyond a mean benchmark."],
    }
    input_rows = [[row["candidate_id"], row["pathway"], row["intervention"], *[float(row[key]) for key in columns], row["kind"], int(row["parent_a"]), int(row["parent_b"]), float(row["weight_b"])] for row in rows]
    DEST.mkdir(parents=True, exist_ok=True)
    write("model.json", model)
    write("inputs.json", {"version": "paired-input-pool-v1", "count": 2000, "sourceSha256": model["source"]["sha256"], "columns": ["id", "pathway", "intervention", *columns, "kind", "parentA", "parentB", "weightB"], "rows": input_rows})
    write("parity.json", {"tolerance": 1e-9, "cases": [{"id": row["candidate_id"], "biogasM3Day": float(p[0]), "methanePct": float(p[1]), "baseline": [float(row[f"hrt_baseline_{key}"]) for key in ["biogas_m3_day", "methane_m3_day", "electricity_kwh_day"]]} for row, p in zip(rows, predicted)]})
    print(json.dumps({"exported": str(DEST), "candidates": len(rows), "allThreeAbove40": sum(float(row["minimum_gain_pct"]) > 40 for row in rows), "learner": model["learner"]}))


if __name__ == "__main__":
    main()
