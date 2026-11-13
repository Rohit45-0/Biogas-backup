# Task 2 local implementation and test results

Implemented and tested locally on 8 November 2026. No deployment was performed.

## What is available

Open **HRT in hours → Task 2 · HRT reduction**. The existing HRT study remains available through its adjacent selector. Task 1 production calculations and reports continue to use their existing model.

The new study supports a fixed workbook reference or entered current operating values, one specified reactor technology or an explicit upgrade comparison, feed-category filtering, production floors, HRT/SRT constraints, temperature and pH limits, and loading constraints with an explicit COD/VS basis. It ranks eligible source scenarios by shortest HRT and breaks ties using the minimum gain across available production comparisons.

The same returned result supplies before/after cards, daily and annual proportional bar charts, the scenario table, a 200-row CSV export and the saved audit record. Changed settings are marked until a new run completes. Missing baseline values remain unavailable, zero-baseline percentage gains remain undefined, and no qualifying candidate produces an explicit empty result.

## Default result

One specified technology: H1 UASB. Workbook conventional CSTR reference. Feed compatibility unspecified. Production floors equal the baseline outputs.

Selected scenario: **HRT-0163**, source workbook row **164**. **23 of 200** records qualify for the selected technology. Three UASB rows share the minimum HRT of 4.8 hours; HRT-0163 has the highest minimum production gain among those tied rows.

| Measure | Baseline | Selected scenario | Change |
| --- | ---: | ---: | ---: |
| HRT | 360 h / 15 days | 4.8 h / 0.2 days | 355.2 h saved; 98.67% reduction |
| Biogas | 66.15 m³/day | 98.00 m³/day | +48.15% |
| Methane | 42.091245 m³/day | 63.21 m³/day | +50.17% |
| Gross electricity | 151.073896554 kWh/day | 226.873332 kWh/day | +50.17% |
| Annual gross electricity | 55,141.97224221 kWh/year | 82,808.76618 kWh/year | +50.17% |

Selected operating values: SRT 48.9 days, temperature 36 °C, pH 7.01, upflow velocity 0.75 m/h, OLR 7.1 kg COD/m³/day and methane fraction 64.5%.

This is a comparison between workbook planning scenarios. The BEFORE reference is a conventional CSTR; moving to UASB assumes a reactor upgrade and feed suitability. These results do not demonstrate a setpoint-only improvement or measured plant performance. Gross electricity excludes parasitic energy loads.

## Best source scenario within each technology

Same workbook baseline and production floors; no additional constraints. Values below are rounded for display. CSTR OLR units remain unresolved.

| Pathway | Selected scenario | HRT (h) | Biogas (m³/day) | Methane (m³/day) | Gross electricity (kWh/day) |
| --- | --- | ---: | ---: | ---: | ---: |
| H1 UASB | HRT-0163 | 4.8 | 98.00 | 63.21 | 226.87 |
| H2 EGSB | HRT-0056 | 4.9 | 94.44 | 64.03 | 229.82 |
| H3 AnMBR | HRT-0102 | 6.0 | 95.97 | 68.43 | 245.60 |
| H4 TPAD | HRT-0166 | 48.3 | 98.10 | 61.80 | 221.82 |
| H5 Thermochemical pretreatment | HRT-0050 | 24.3 | 94.24 | 60.03 | 215.46 |
| H6 Thermal pretreatment / co-digestion | HRT-0096 | 26.3 | 95.77 | 58.90 | 211.40 |
| C1 Thermophilic CSTR | HRT-0070 | 74.1 | 94.90 | 60.64 | 217.65 |
| C2 CSTR / thermochemical pretreatment | HRT-0098 | 107.7 | 95.84 | 59.42 | 213.27 |
| C3 Hybrid CSTR | HRT-0180 | 49.7 | 98.56 | 60.81 | 218.26 |

## Model assessment and data limitations

Both original workbooks are preserved, with hashes and all eight sheets archived. The expanded workbook supplies 200 scenarios and nine pathways. The earlier six-pathway file is reference material, not 200 additional independent training records.

An isolated Ridge predictor was trained and assessed using operating inputs and technology, excluding scenario IDs, declared gains and AFTER outcomes. OLR was excluded because of the source unit conflict. Hyperparameters were selected within each training split; held-out rows did not choose them.

The random held-out biogas R² is **−0.05885**, with MAE **1.81237 m³/day**. The ordered last-20% stress test gives biogas R² **−75.01791** and MAE **3.32112 m³/day**. Methane and electricity perform better than biogas on the random split, but the complete predictor does not meet the promotion criterion. The biogas targets also follow a prescribed 40–50% gain sequence across scenario IDs.

**Generated predictions are disabled.** The active engine evaluates the 200 original planning scenarios; it does not describe them as 2,000 model-generated predictions. The assessed model artifact is retained with `deployable: false`. Additional matched BEFORE/AFTER observations are needed to learn an input-dependent baseline and validate the HRT-production relationship.

There are **66 CSTR rows** whose loading values have conflicting COD/VS units. These remain available for source comparison with a warning, but cannot qualify under a loading constraint until the unit basis is resolved. No COD-to-VS conversion is invented.

Canonical calculations use stored biogas and methane percentage, then derive methane, gross electricity and annual totals at full precision. Original workbook values are preserved separately. This resolves the source's independently rounded and inconsistent annual totals without rewriting the original evidence.

## Verification completed

- Production build and TypeScript compilation: passed.
- Targeted lint on new server, API and UI files: passed.
- Full backend test suite: **66 passed, 0 failed**. The 9 Task 2 tests were also rerun after final assessment and source-integrity checks.
- Browser test: passed login, default selection, all three before/after charts, day/year calculations and proportional bars, 200-row CSV, deterministic replay, audit listing and retrieval, altered-record rejection, changed inputs, missing and no-qualifying-result behavior, session reload, invalid requests and role boundaries.
- Layouts: **1920, 1440, 1366, 1280, 768, 390 and 320 px** widths passed page/chart overflow checks. Desktop and phone screenshots were visually inspected.
- Existing Task 1 optimization, AI & KPI reports, audit retrieval and existing HRT study navigation: passed.
- Graphify updated after application changes.

Test evidence: `test-results/task2-full-suite.log`, `test-results/task2-build.log`, and `test-results/hrt-optimization/verification.json`. Screenshots are in `test-results/hrt-optimization/`.

## Reproduction

From the active application directory, using Python with NumPy and openpyxl:

```text
python ai-workflow/src/prepare_hrt_optimization.py
python ai-workflow/src/assess_hrt_optimization.py
node scripts/model-manifest.mjs
node node_modules/next/dist/bin/next build --webpack
node --test tests/*.test.mjs
node scripts/verify-hrt-optimization-ui.mjs
```

The browser test creates an isolated localhost server with temporary credentials and local audit storage, then stops that test server. It does not call Vercel or write to production storage.

Source artifacts, original workbooks, normalized scenarios, reconciliation differences and model assessment are under `ai-workflow/research/hrt-optimization-2026-11-08/`.
