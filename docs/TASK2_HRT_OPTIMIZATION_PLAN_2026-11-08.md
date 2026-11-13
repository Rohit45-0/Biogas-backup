# Task 2: HRT optimization implementation plan

Date: 8 November 2026

Status: Implemented and tested locally. See `TASK2_LOCAL_RESULTS_2026-11-08.md` for results. The model assessment did not qualify generated predictions, so the active Task 2 engine ranks the 200 original source scenarios. No deployment has been performed.

## Objective

Find the lowest supported hydraulic retention time (HRT) for a specified reactor technology and operating configuration, while meeting the selected minimum biogas, methane and electricity outputs. Show the baseline, proposed operating conditions, production predictions and time saved together.

The recommendation is the best qualifying candidate evaluated, not a proven global optimum or a demonstrated plant improvement. The supplied workbooks describe simulated planning scenarios.

## Scope and defaults

- Preserve the current Task 1 production model, approved dashboard appearance, labels, reports and historical audit records.
- Develop Task 2 as a separate, versioned HRT study. Integrate its controls and results into the existing HRT area without renaming sidebar items.
- Default to a specified installed reactor technology. Comparing different technologies is an explicit upgrade-planning mode, since a different reactor is not an ordinary operating adjustment.
- Minimize HRT subject to production floors. Initially, use baseline daily biogas, methane and electricity as those floors; show any user changes explicitly.
- Do not inherit Task 1's greater-than-40% filter. Task 2's objective is HRT reduction while meeting production requirements.
- Keep the same inputs reproducible. A new click must not manufacture a different result or a positive gain.

## 1. Prepare and reconcile the source data

Primary source: `C:/Users/barsh/Downloads/task2.1.xlsx`.

Reference source: `C:/Users/barsh/Downloads/task2.xlsx`.

Both have Summary, 200 Scenarios, Technology Averages and Assumptions sheets. The expanded file has nine technology pathways instead of six, but still has 200 scenarios. Reused scenario IDs and regenerated values mean the two files must not be concatenated as 400 independent observations.

Implementation:

1. Preserve both original files and their SHA-256 hashes in the Task 2 research artifact folder. Record sheet and row provenance for every imported scenario.
2. Import all scenario fields into a typed schema with separate input, outcome, baseline and source-metadata fields.
3. Keep HRT in hours and sludge retention time (SRT) in days. Retain the original units beside normalized values.
4. Represent organic loading rate (OLR) with an explicit COD or VS basis. The scenario header says COD, while the expanded assumptions describe CSTR loading in VS. Flag this conflict; do not convert or combine the two without a justified basis.
5. Preserve stored workbook values and compute reconciliation differences separately. Recalculate displayed projections and gains consistently from the chosen canonical daily values, without overwriting source cells.

Important reconciliation example: the displayed daily baseline electricity of 151.07 kWh multiplied by 365 is 55,140.55 kWh/year. The workbook's annual baseline is approximately 55,139. These are not an exact arithmetic match. Store the discrepancy and select one documented calculation basis for the application.

For calculated scenarios, derive methane from biogas and methane fraction, then derive gross electricity from methane using the stated 9.97 kWh/m³ and 36% electrical conversion assumption. Keep full precision until display formatting. If measured outputs are later supplied, retain those as measurements rather than silently replacing them with derived values.

Deliverable: source manifest, normalized scenarios, data dictionary and reconciliation report.

## 2. Establish the baseline and technology constraints

The supplied BEFORE reference is fixed across scenarios: 360 hours (15 days), 66.15 m³/day biogas, 42.09 m³/day methane and 151.07 kWh/day electricity, using the stored rounded values.

Support two explicit baseline modes:

- **Workbook reference:** use the supplied fixed BEFORE reference and disclose its origin.
- **User-provided baseline:** accept the current HRT and available daily production measurements or documented calculation inputs. Keep the baseline fixed throughout that run. Missing outputs remain unavailable rather than being invented.

These files cannot train an input-dependent untreated baseline because their BEFORE values do not vary. Do not extrapolate the existing Task 1 model from its 2–24-hour coverage to 360 hours.

Maintain per-technology constraints and coverage:

| Pathway | Technology | Workbook planning HRT range |
| --- | --- | --- |
| H1 | UASB | 4–12 h |
| H2 | EGSB | 4–10 h |
| H3 | AnMBR | 6–12 h |
| H4 | Temperature-phased digestion | 48–96 h |
| H5 | Thermochemical pretreatment plus high-rate AD | 24–48 h |
| H6 | Thermal pretreatment plus co-digestion | 24–72 h |
| C1 | Thermophilic CSTR | 72–120 h |
| C2 | CSTR plus thermochemical pretreatment | 96–168 h |
| C3 | Hybrid CSTR with biomass carriers | 48–96 h |

Declared planning ranges are not validated operating limits. Restrict model inference to supported joint input coverage; do not assume every combination inside separate column ranges is supported. Collect reactor configuration and feed suitability information before claiming plant applicability. Unknown feed compatibility must remain visible.

## 3. Evaluate model suitability before expanding the search

First implement reproducible ranking of the 200 supplied scenarios. Then assess a separate predictor for supported operating inputs.

The biogas gains in these files follow a prescribed, nearly evenly spaced 40–50% sequence with scenario ID. This is a material limitation: the data cannot establish that changing HRT causes those gains.

Model assessment requirements:

- Use available operating inputs and technology identifiers only. Exclude scenario IDs, gains, AFTER outputs and other target-derived fields from predictors.
- Predict biogas and methane fraction; calculate methane and electricity consistently from those predictions. HRT is a candidate decision input, not an outcome inferred from production targets.
- Compare simple candidate models against simple reference predictors using held-out data with technology coverage. Include a row-order stress check because of the constructed gain sequence.
- Record held-out errors and coverage limitations. Do not present training fit as independent validation or create uncalibrated confidence scores.
- If prediction does not improve on simple references, retain the scenario-ranking tool and report that predictive optimization is not established by this dataset.

Only after this assessment, allow up to 2,000 unique evaluated candidate inputs from supported regions within the same technology and unit basis. Do not interpolate across reactor types or create impossible combinations by sampling each column independently. The 200 source rows and the evaluated candidate count remain distinct in the UI and exports.

Selection order: reject unsupported candidates; enforce production floors and requested constraints; choose the lowest qualifying HRT; break ties using the minimum production gain across the available required outputs. Return an explicit no-qualifying-candidate result when appropriate.

## 4. Connect one result to the dashboard, exports and audit

Reuse the current responsive visual components where practical. Add Task 2 results within the existing HRT area:

- Baseline HRT, selected HRT, hours saved and percentage reduction.
- Before/after biogas, methane and gross electricity values with units and percentage changes.
- Selected technology, operating conditions and input-coverage notes.
- Ranked scenario table with before/after values, eligibility reasons and CSV export.

Use these identities throughout:

```text
HRT change (h) = selected HRT - baseline HRT
Time saved (h) = baseline HRT - selected HRT
HRT reduction (%) = 100 × (baseline HRT - selected HRT) / baseline HRT
Production change (%) = 100 × (selected output - baseline output) / baseline output
Annual production = daily production × 365
```

Require positive HRT baselines and handle zero or missing production baselines explicitly. Gross electricity excludes heating, pretreatment, pumps and membrane loads; net energy savings require those additional inputs.

The API returns one versioned result consumed by cards, charts, reports and CSV. Record source and model hashes, baseline origin, request inputs, candidate-generation method and seed where applicable, evaluated/eligible counts, selected candidate and warnings in the audit record. Preserve old result schemas and replay behavior.

Proposed isolated implementation locations:

- `ai-workflow/research/hrt-optimization-2026-11-08/`: source manifest, normalized data and assessment artifacts.
- `ai-workflow/src/prepare_hrt_optimization.py`: import, unit checks and reconciliation.
- `app/lib/hrt-optimization.ts`: request/result contracts, constraints and ranking.
- `app/api/research/hrt-optimization/route.ts`: authenticated Task 2 execution.
- A dedicated Task 2 component composed into `app/components/HrtResearchWorkspace.tsx`.

Reuse shared authentication and audit infrastructure; keep Task 2 calculations separate from Task 1 selection logic.

## 5. Acceptance and release sequence

1. **Data gate:** all eight sheets accounted for; 200 expanded scenarios imported; duplicates, missing fields, source provenance and unit conflicts documented.
2. **Calculation gate:** HRT/SRT conversions, production identities, percentage denominators, annual projections and rounding reconcile. UI, API, CSV and audit use the same result.
3. **Selection gate:** locked reactor types cannot switch silently; unsupported inputs are rejected or flagged; no qualifying result does not trigger fabricated uplift; identical inputs and seeds reproduce the result.
4. **Model gate:** assess held-out performance and leakage before enabling generated model recommendations. Clearly distinguish workbook scenarios from model predictions.
5. **Application gate:** verify login, Task 1 optimization, reports and audit remain working; test the HRT view at desktop and mobile widths using the approved design.
6. **Release:** produce a working preview, validate the complete Task 2 flow, then publish the tested version to the existing permanent application address. Record the release and model versions.

First implementation milestone: the importer, reconciliation report and a baseline-aware ranking of the 200 original scenarios. This provides an inspectable foundation before training or generating additional candidates.
