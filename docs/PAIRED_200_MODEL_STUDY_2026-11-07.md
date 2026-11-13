# Model study using the supplied 200 before/after scenarios

The new workbook was used to train an isolated candidate model and evaluate 2,000 unique supported input combinations. No candidate improved biogas, methane and electricity by more than 50% together. The initial training study did not replace an existing application model, UI or deployment. The subsequent [dashboard integration](PAIRED_DASHBOARD_2026-11-07.md) uses this artifact in the workspace, with a greater-than-40% candidate priority.

## Source and baseline

Source: `Aquaivolt Biogas 200 Scenarios Before vs After.xlsx`, sheet `200 Scenarios`, A1:AC201. SHA-256: `1bbcd81fae5e3af525263844f9ac14dad62268ba7c4151649c851821f6bca0ab`.

The workbook describes a planning simulation. Its biogas gain is swept from 40% to 50% in scenario-number order. All 200 BEFORE rows contain 66.15 m3/day biogas, 42.09 m3/day methane and 151.07 kWh/day electricity. Therefore it cannot train a varying untreated baseline from its BEFORE labels. Scenario number correlates with after-biogas at approximately 0.99999887 and was excluded from model features.

Two comparisons are retained:

1. The exact constant workbook BEFORE reference.
2. An exploratory baseline from the existing `hours-research-1.0.0` model evaluated at the candidate's own HRT. This baseline varies with HRT only. It is not a new multivariable baseline trained on this workbook. Differences between these two models do not establish causal treatment effects.

The HRT baseline supports 2–24 hours. All 200 rows were eligible for AFTER-model training, but 27 source rows above 24 hours were excluded from candidate generation. No baseline extrapolation was used.

## Training and evaluation

Features: pathway, HRT, temperature, pH, feed and OLR. Targets: after-biogas and methane percentage. Methane volume is gas volume multiplied by methane fraction. Electricity is methane volume multiplied by 9.97 kWh/m3 and 36% efficiency. This is gross generation, before process or pretreatment energy costs.

Scenario IDs, declared gains and other AFTER outcomes were excluded from features. A deterministic pathway-stratified split allocated 160 development rows and 40 held-out rows. Five-fold development cross-validation compared five Ridge configurations, KNN, Random Forest, Extra Trees and Gradient Boosting against a mean benchmark. Ridge alpha 100 achieved the lowest cross-validation normalized MAE (0.87329). It was evaluated once on the primary holdout and then refitted on all 200 rows.

| Held-out output | MAE | R2 |
| --- | ---: | ---: |
| Biogas, m3/day | 1.65356 | -0.08071 |
| Methane, m3/day | 1.54883 | -0.00150 |
| Electricity, kWh/day | 5.55974 | -0.00162 |

Predictive performance is weak. The source is insufficient to establish an operating-input response model or reliable plant optimization benefit. The saved model is an exploratory study artifact, not a plant-validated production model. A secondary row-order stress test is diagnostic only; it is not an independent model-selection experiment.

## Candidate search

The search contains 173 supported source inputs and 1,827 seeded interpolations between nearby rows within the same pathway. Every interpolated input is a convex combination of two recorded input vectors. These are evaluated candidates, not new training observations. Ranking maximizes the smallest gain across the three outputs, with electricity gain used to break ties. The result is the best found in this candidate set, not a proven global optimum.

Both baseline comparisons produced zero candidates with all three gains strictly greater than 50%.

The highest-ranked model candidate is PAIR-0087, pathway P6 (microwave pretreatment and co-digestion). Its input corresponds to source scenario 102: HRT 23.35 h, temperature 37.24 C, pH 7.34, feed 948.5 kg VS/day and OLR 4.8 kg VS/m3/day.

| Output | HRT baseline | New model prediction | Gain |
| --- | ---: | ---: | ---: |
| Biogas, m3/day | 66.43508 | 96.21097 | 44.81952% |
| Methane, m3/day | 42.19536 | 60.48404 | 43.34287% |
| Electricity, kWh/day | 151.44759 | 217.08932 | 43.34287% |

Separately, the closest recorded workbook row is scenario 197: 49.85639% biogas, 51.05726% methane and 51.04918% electricity against its constant source baseline. Those are supplied simulation values, not the retrained model's prediction.

## Reproduction and files

From the active application folder, extract with `scripts/inspect-paired-workbook.py`. Train with `ai-workflow/src/train_paired_scenarios.py --source-json ai-workflow/research/paired-200-2026-11-07/source.json --baseline-model ai-workflow/research/hours-model.json --output outputs/paired-200-2026-11-07`. Verify with `ai-workflow/src/verify_paired_study.py outputs/paired-200-2026-11-07 ai-workflow/research/paired-200-2026-11-07/source.json`.

Training runtime: Python 3.12, scikit-learn 1.9.1, numpy 2.5.3, scipy 1.18.1 and joblib 1.6.0. The workbook extraction uses openpyxl in read-only mode. All selections and candidate generation use seed 20261107.

Outputs include the joblib model, full model-selection and split evidence, 40 holdout predictions, all 2,000 ranked candidates, top 20 candidates, a readable Excel results workbook, and independent verification checks. Gain formula consistency, conversion identities, feature exclusions, unique candidates, interpolation provenance, disjoint holdout IDs and saved-model hash passed. The top five dynamic baselines match the application's TypeScript prediction function within 1e-10.

For a baseline that responds independently to feed, temperature, pH and OLR, obtain paired BEFORE and AFTER input/output records. The fixed baseline in this workbook cannot identify those effects.
