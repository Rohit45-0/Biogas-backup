"""Preserve and reconcile Task 2 workbooks without editing the originals."""
import argparse
import hashlib
import json
import re
import shutil
from collections import Counter
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "ai-workflow/research/hrt-optimization-2026-11-08"
FACTOR = 9.97 * .36
VERSION = "hrt-technology-study-2026-11-08-v1"


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")


def outputs(gas, fraction):
    methane = gas * fraction / 100
    energy = methane * FACTOR
    return dict(biogasM3Day=gas, methanePct=fraction, methaneM3Day=methane,
                electricityKwhDay=energy, annualElectricityKwh=energy * 365)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--primary", type=Path, default=Path.home() / "Downloads/task2.1.xlsx")
    parser.add_argument("--reference", type=Path, default=Path.home() / "Downloads/task2.xlsx")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "sources").mkdir(exist_ok=True)
    sources, archives = [], []
    for source, role in [(args.primary, "primary"), (args.reference, "reference_only")]:
        workbook = openpyxl.load_workbook(source, data_only=False)
        sheets = {}
        for sheet in workbook:
            rows = [list(row) for row in sheet.values]
            formulas = sum(isinstance(v, str) and v.startswith("=") for row in rows for v in row)
            sheets[sheet.title] = dict(rows=rows, rowCount=sheet.max_row,
                                      columnCount=sheet.max_column, formulaCount=formulas)
        assert set(sheets) == {"Summary", "200 Scenarios", "Technology Averages", "Assumptions"}
        assert all(sheet["formulaCount"] == 0 for sheet in sheets.values())
        rows = sheets["200 Scenarios"]["rows"]
        assert len(rows) == 201 and len(rows[0]) == 31
        assert all(all(v is not None for v in row) for row in rows[1:])
        assert len({row[0] for row in rows[1:]}) == 200
        digest = "sha256:" + hashlib.sha256(source.read_bytes()).hexdigest()
        shutil.copy2(source, OUT / "sources" / source.name)
        sources.append(dict(file=source.name, sha256=digest, role=role, scenarioCount=200,
                            pathways=dict(Counter(row[1] for row in rows[1:])),
                            sheets={k: {a: b for a, b in v.items() if a != "rows"} for k, v in sheets.items()}))
        archives.append(dict(file=source.name, sha256=digest, sheets=sheets))

    sheet = archives[0]["sheets"]
    raw = sheet["200 Scenarios"]["rows"]
    baseline_raw = raw[1][4:10]
    assert all(row[4:10] == baseline_raw for row in raw[1:])
    baseline = dict(hrtHours=baseline_raw[0], **outputs(baseline_raw[1], baseline_raw[2]),
                    technology="Conventional mesophilic CSTR", origin="workbook_reference")
    technologies = []
    for row in sheet["Summary"]["rows"]:
        if row[0] not in {"H1", "H2", "H3", "H4", "H5", "H6", "C1", "C2", "C3"}:
            continue
        match = re.search(r"(\d+)-(\d+)", row[2])
        technologies.append(dict(id=row[0], name=row[1], planningHrtHours=[int(match[1]), int(match[2])],
                                 sourceUrl=row[3], olrBasis="UNRESOLVED_COD_VS" if row[0].startswith("C") else "COD"))
    scenarios, differences = [], []
    for rownum, row in enumerate(raw[1:], start=2):
        prediction = outputs(row[18], row[17])
        scenario = dict(id=f"HRT-{row[0]:04d}", sourceScenario=row[0], pathway=row[1],
                        technology=row[2], configuration=row[3], hrtHours=row[10], srtDays=row[12],
                        temperatureC=row[13], ph=row[14], upflowMHour=row[15], olr=row[16],
                        olrBasis="UNRESOLVED_COD_VS" if row[1].startswith("C") else "COD",
                        outputs=prediction, h2sInPpm=row[27], h2sOutPpm=row[28], stabilityPct=row[29],
                        provenance=dict(file=args.primary.name, sheet="200 Scenarios", row=rownum, sourceUrl=row[30]))
        assert all(isinstance(scenario[key], (int, float)) for key in ["hrtHours", "srtDays", "temperatureC", "ph", "upflowMHour", "olr"])
        assert scenario["hrtHours"] > 0 and scenario["srtDays"] > 0 and 0 < prediction["methanePct"] < 100
        scenarios.append(scenario)
        differences.append(dict(id=scenario["id"],
                                methaneM3Day=prediction["methaneM3Day"] - row[19],
                                electricityKwhDay=prediction["electricityKwhDay"] - row[20],
                                annualElectricityKwh=prediction["annualElectricityKwh"] - row[21],
                                storedAnnualMinusStoredDailyTimes365=row[21] - row[20] * 365,
                                hrtReductionPct=(360-row[10])/360*100-row[11],
                                gainSequenceDeviation=row[23]-(40+(row[0]-1)*10/199)))
    for technology in technologies:
        rows = [s for s in scenarios if s["pathway"] == technology["id"]]
        technology["scenarioCount"] = len(rows)
        technology["observedHrtHours"] = [min(s["hrtHours"] for s in rows), max(s["hrtHours"] for s in rows)]
        assert technology["planningHrtHours"][0] <= technology["observedHrtHours"][0]
        assert technology["planningHrtHours"][1] >= technology["observedHrtHours"][1]

    manifest = dict(version=VERSION, sources=sources, primarySource=sources[0], trainingRows=200,
                    calculationBasis="Canonical outputs use stored biogas and methane percentage; methane, gross electricity and annual projections are derived without intermediate rounding.",
                    energy=dict(methaneKwhM3=9.97, electricalEfficiency=.36, daysPerYear=365),
                    dataRole="WORKBOOK_PLANNING_SIMULATION", baseline=baseline, technologies=technologies)
    save("source-manifest.json", manifest)
    save("source-archive.json", archives)
    save("scenarios.json", scenarios)
    reconciliation = dict(baselineStored=dict(zip(raw[0][4:10], baseline_raw)), baselineCanonical=baseline,
                          sourceRows=200, missingCells=0, duplicateScenarioIds=0,
                          unresolvedOlrRows=sum(s["olrBasis"] != "COD" for s in scenarios),
                          maxAbsoluteDifferences={key: max(abs(r[key]) for r in differences) for key in differences[0] if key != "id"},
                          rows=differences)
    save("reconciliation.json", reconciliation)
    (OUT / "DATA_DICTIONARY.md").write_text("""# Task 2 data dictionary

Original files and all eight sheets are retained in sources/ and source-archive.json. Source rows are planning simulations, not measurements. task2.xlsx is reference only, not additional training data.

| Normalized field | Workbook column / unit | Treatment |
| --- | --- | --- |
| id, sourceScenario | A | Identifier only; excluded from prediction |
| pathway, technology, configuration | B–D | Technology context |
| baseline | E–J | Fixed conventional CSTR reference |
| hrtHours | K / hours | Candidate decision input |
| srtDays | M / days | Kept separate from HRT |
| temperatureC, ph, upflowMHour | N–P | Operating inputs |
| olr, olrBasis | Q | COD for H pathways; C pathway COD/VS conflict unresolved |
| outputs.methanePct | R / % | Outcome, never a predictor |
| outputs.biogasM3Day | S / m³/day | Stored source outcome |
| outputs.methaneM3Day | S × R / 100 | Reconciled derived outcome |
| outputs.electricityKwhDay | methane × 9.97 × 0.36 | Gross electricity, excludes parasitic loads |
| outputs.annualElectricityKwh | daily electricity × 365 | Constant-output projection |
| h2sInPpm, h2sOutPpm, stabilityPct | AB–AD | Source simulation values, not safety limits |
| provenance | Workbook, sheet, row, AE URL | Traceability; URL claims not independently verified |

Stored T–AA values remain in source-archive.json and their discrepancies are reported in reconciliation.json. They are not features. All model inputs exclude scenario ID and prescribed gain fields. The BEFORE columns are constant and cannot train a dynamic untreated baseline. Individual operating ranges are not validated safety limits.
""", encoding="utf-8")
    print(json.dumps({"scenarios": len(scenarios), "technologies": len(technologies),
                      "unresolvedOlrRows": reconciliation["unresolvedOlrRows"], "baseline": baseline}))


if __name__ == "__main__":
    main()
