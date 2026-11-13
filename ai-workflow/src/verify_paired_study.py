"""Independent numerical/provenance checks on the saved 2,000-candidate export."""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path


def close(a, b):
    assert math.isclose(float(a), float(b), rel_tol=1e-10, abs_tol=1e-9), (a, b)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("source_json", type=Path)
    args = parser.parse_args()
    study = json.loads((args.directory / "study_results.json").read_text(encoding="utf-8"))
    source = json.loads(args.source_json.read_text(encoding="utf-8"))
    by_id = {row["Scenario"]: row for row in source["rows"]}
    with (args.directory / "all_2000_scenarios.csv").open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == 2000 and len({row["candidate_id"] for row in rows}) == 2000
    assert len({tuple(row[key] for key in ["pathway", "hrt_hours", "temperature_c", "ph", "feed_kg_vs_day", "olr_kg_vs_m3_day"]) for row in rows}) == 2000
    assert len(study["train_ids"]) == 160 and len(study["test_ids"]) == 40
    assert not set(study["train_ids"]) & set(study["test_ids"])
    assert set(study["train_ids"]) | set(study["test_ids"]) == set(by_id)
    assert study["features"] == ["Pathway", "HRT (h)", "Temp (C)", "pH", "Feed (kg VS/d)", "OLR (kg VS/m3/d)"]
    qualifiers, fixed_qualifiers, minimums = 0, 0, []
    for rank, row in enumerate(rows, 1):
        assert int(row["rank"]) == rank
        assert 2 <= float(row["hrt_hours"]) <= 24
        first, second = by_id[int(row["parent_a"])], by_id[int(row["parent_b"])]
        assert first["Pathway"] == second["Pathway"] == row["pathway"]
        weight = float(row["weight_b"])
        assert 0 <= weight <= 1
        for column, key in [("hrt_hours", "HRT (h)"), ("temperature_c", "Temp (C)"), ("ph", "pH"),
                            ("feed_kg_vs_day", "Feed (kg VS/d)"), ("olr_kg_vs_m3_day", "OLR (kg VS/m3/d)")]:
            close(row[column], first[key] * (1 - weight) + second[key] * weight)
        gas = float(row["predicted_after_biogas_m3_day"])
        methane = float(row["predicted_after_methane_m3_day"])
        electricity = float(row["predicted_after_electricity_kwh_day"])
        close(methane, gas * float(row["predicted_methane_pct"]) / 100)
        close(electricity, methane * 9.97 * 0.36)
        gains, fixed_gains = [], []
        for key in ["biogas_m3_day", "methane_m3_day", "electricity_kwh_day"]:
            after = float(row[f"predicted_after_{key}"])
            before = float(row[f"hrt_baseline_{key}"])
            fixed = float(row[f"workbook_baseline_{key}"])
            assert after > 0 and before > 0 and fixed > 0
            gain = 100 * (after / before - 1)
            fixed_gain = 100 * (after / fixed - 1)
            close(row[f"gain_vs_hrt_baseline_{key}_pct"], gain)
            close(row[f"gain_vs_workbook_baseline_{key}_pct"], fixed_gain)
            gains.append(gain)
            fixed_gains.append(fixed_gain)
        qualifies, fixed_qualifies = min(gains) > 50, min(fixed_gains) > 50
        assert (row["all_three_above_50"] == "True") == qualifies
        assert (row["all_three_above_50_workbook_baseline"] == "True") == fixed_qualifies
        qualifiers += qualifies
        fixed_qualifiers += fixed_qualifies
        close(row["minimum_gain_pct"], min(gains))
        minimums.append(min(gains))
    assert minimums == sorted(minimums, reverse=True)
    assert qualifiers == study["all_three_above_50_dynamic_baseline"]
    assert fixed_qualifiers == study["all_three_above_50_workbook_baseline"]
    assert len({row["hrt_baseline_biogas_m3_day"] for row in rows}) > 1000
    assert len({row["hrt_baseline_methane_m3_day"] for row in rows}) > 1000
    assert hashlib.sha256((args.directory / "paired-after-model.joblib").read_bytes()).hexdigest() == study["artifact"]["sha256"]
    result = {"status": "PASS", "rows_verified": len(rows), "holdout_disjoint": True,
              "no_outcome_or_id_features": True, "same_pathway_interpolations_verified": True,
              "baseline_coverage_verified": True, "physical_conversions_verified": True,
              "gain_formulas_and_ranking_verified": True, "saved_model_hash_verified": True,
              "all_three_above_50_dynamic_baseline": qualifiers,
              "all_three_above_50_workbook_baseline": fixed_qualifiers}
    (args.directory / "verification.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
