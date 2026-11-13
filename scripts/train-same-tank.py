"""Reproducible planning-data model; source identifiers and outputs are never features."""
from pathlib import Path
import hashlib, json
import numpy as np
import openpyxl
from sklearn.linear_model import Ridge
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, r2_score

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path.home() / 'Downloads' / 'Aquaivolt Same-Reactor +40% & HRT Hours  Verdict + 500 Scenarios.xlsx'
OUT = ROOT / 'ai-workflow/research/same-tank-500-2026-11-10'
OUT.mkdir(parents=True, exist_ok=True)
wb = openpyxl.load_workbook(SOURCE, data_only=True, read_only=True)
sheets = {ws.title: list(ws.values) for ws in wb.worksheets}
headers, *raw = sheets['500 Scenarios']
assert len(raw) == 500 and len(headers) == 26
source = {'file': SOURCE.name, 'sheet': '500 Scenarios', 'sha256': 'sha256:' + hashlib.sha256(SOURCE.read_bytes()).hexdigest()}
rows = [dict(zip(headers, row)) for row in raw]
stages = sorted({r[1] for r in raw})
numeric = np.array([[r[5], r[20], r[21], r[22]] for r in raw], dtype=float)
targets = np.array([[r[8], r[11]] for r in raw], dtype=float)
categories = np.array([[int(r[1] == s) for s in stages] for r in raw])
train, test = train_test_split(np.arange(500), test_size=.2, random_state=20261110, stratify=[r[1] for r in raw])
def fit(indices):
    scaler = StandardScaler().fit(numeric[indices])
    x = np.hstack([categories[indices], scaler.transform(numeric[indices])])
    return scaler, Ridge(alpha=10).fit(x, targets[indices])
scaler, learner = fit(train)
held = learner.predict(np.hstack([categories[test], scaler.transform(numeric[test])]))
def output_values(p):
    gas, fraction = p[:, 0], p[:, 1]
    methane = gas * fraction / 100
    return np.column_stack([gas, methane, methane * 9.97 * .36])
actual = np.array([[raw[i][8], raw[i][13], raw[i][15]] for i in test], dtype=float)
predicted = output_values(held)
holdout = {key: {'mae': float(mean_absolute_error(actual[:, i], predicted[:, i])), 'r2': float(r2_score(actual[:, i], predicted[:, i]))} for i, key in enumerate(['biogas_m3_day', 'methane_m3_day', 'electricity_kwh_day'])}
scaler, learner = fit(np.arange(500))
stage_info = []
for stage in stages:
    indices = [i for i, row in enumerate(raw) if row[1] == stage]
    subset = [raw[i] for i in indices]
    baselines = {tuple(row[j] for j in [4, 7, 10, 12, 14]) for row in subset}
    assert len(baselines) == 1, 'Baseline pairing must be revised if source BEFORE values vary'
    stage_info.append({'id': stage, 'label': subset[0][2], 'added': subset[0][3], 'feedRequirements': sorted({str(r[24]) for r in subset}), 'sourceVerdicts': sorted({str(r[23]) for r in subset}), 'count': len(subset), 'min': numeric[indices].min(axis=0).tolist(), 'max': numeric[indices].max(axis=0).tolist()})
rng = np.random.default_rng(20261110)
inputs, parity = [], []
for i in range(2000):
    stage = stages[i % len(stages)]
    available = [j for j, r in enumerate(raw) if r[1] == stage]
    a, b = rng.choice(available, 2, replace=False)
    weight = float(rng.uniform(.05, .95))
    values = numeric[a] * (1-weight) + numeric[b] * weight
    ident = f'ST-{i+1:04d}'
    inputs.append({'id': ident, 'stage': stage, 'values': values.tolist(), 'parentA': int(a)+1, 'parentB': int(b)+1, 'weightB': weight})
    features = np.array([[int(stage == s) for s in stages] + ((values-scaler.mean_)/scaler.scale_).tolist()])
    prediction = learner.predict(features)
    parity.append({'id': ident, 'biogasM3Day': float(prediction[0,0]), 'methanePct': float(prediction[0,1]), 'methaneM3Day': float(output_values(prediction)[0,1]), 'electricityKwhDay': float(output_values(prediction)[0,2])})
model = {'version': 'same-tank-ridge-500-2026-11-10-v1', 'learner': 'One-hot stage + StandardScaler + Ridge (alpha 10)', 'source': source, 'fitRows': 500, 'developmentRows': 400, 'testRows': 100, 'features': ['stage','afterHrtHours','temperatureC','ph','srtDays'], 'targets': ['biogasM3Day','methanePct'], 'stages': stages, 'stageInfo': stage_info, 'mean': scaler.mean_.tolist(), 'scale': scaler.scale_.tolist(), 'coefficients': learner.coef_.tolist(), 'intercept': learner.intercept_.tolist(), 'holdout': holdout, 'validationMethod': 'Seeded stratified 400/100 split; scaler fitted only on development rows. Final model refitted on all 500 after evaluation.', 'limitations': ['Source data are planning simulations, not plant measurements.', 'Before values are constant in the supplied file; no dynamic untreated baseline can be learned.', 'Scenario identifiers and all BEFORE/AFTER target columns are excluded from the model features.', 'Fast HRT stages require the listed feed preparation and biomass-retention retrofits. Software alone does not supply them.', 'Held-out scores measure simulated-data agreement only; calibrated prediction intervals and plant validation are unavailable.', 'Electricity is gross potential at 36% conversion efficiency; retrofit energy costs are not supplied.', 'HRT is a candidate input, not a learned causal effect. Other conditions vary between candidates.']}
def save(name, obj):
    (OUT/name).write_text(json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False)+'\n', encoding='utf-8')
save('source.json', {'source': source, 'headers': headers, 'rows': rows, 'sheets': sheets})
save('model.json', model)
save('inputs.json', {'seed': 20261110, 'method': '2000 distinct same-stage convex interpolations; no output interpolation', 'rows': inputs})
save('parity.json', {'tolerance': 1e-8, 'cases': parity})
print(json.dumps({'source': source, 'trainingRows': 500, 'candidates': len(inputs), 'holdout': holdout, 'stageRanges': stage_info}, indent=2))
