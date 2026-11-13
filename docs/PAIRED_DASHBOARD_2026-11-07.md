# Input-based dashboard integration — 7 November 2026

The default dashboard mode now evaluates the trained 200-row model on the 2,000 inputs from the [model study](PAIRED_200_MODEL_STUDY_2026-11-07.md). The source training data and fitted coefficients are unchanged. These candidates are evaluation inputs, not 2,000 training observations.

## Calculation and selection

1. Load 173 supported source input vectors and 1,827 same-pathway convex interpolations. All candidate HRTs are within the existing baseline model's 2–24-hour support.
2. For every input, evaluate the exact exported one-hot encoder, numeric scaler and Ridge-100 coefficients. Predict biogas and methane fraction from pathway, HRT, temperature, pH, feed and loading.
3. Calculate methane as biogas × methane fraction; electricity as methane × 9.97 × 0.36. These are gross outputs; pretreatment energy demand is unavailable.
4. Evaluate the separate existing hours model at each candidate's own HRT for its three baseline outputs. No fixed 50 m³/day reference is used in this mode.
5. Prioritize candidates with **strictly more than 40%** gain in **each** of biogas, methane and electricity. There are **1,272** such candidates in this pool.
6. Randomly choose an eligible input, excluding the previous candidate and preferring visibly different baseline/prediction pairs when possible. Selection can revisit an earlier input after other runs; it is not sampling without replacement across a session. Save the random seed and previous candidate ID for deterministic replay.
7. If no candidate qualifies, return the best actual minimum-gain comparison and mark the threshold unmet. Never multiply predictions to create a gain.

Each click evaluates the same supported input pool; it does not retrain the model or regenerate arbitrary inputs. The selected candidate changes. The same input and model always give the same prediction.

## Meaning and limits

This is an exploratory comparison between two models. The baseline changes with **HRT only**. It is not a learned untreated response to temperature, pH, feed, loading or treatment pathway. The new workbook has constant BEFORE outputs, so it cannot supply that response.

The workbook is a planning simulation with prescribed output gains. Held-out R² is negative (biogas −0.0807, methane −0.0015, electricity −0.0016). Predicted differences do not demonstrate plant accuracy, measured treatment benefit or a causal optimization effect. The dashboard and source/evaluation view disclose these limits. Stability and H₂S are not predicted by the new production model and remain unavailable.

## UI and evidence

- Biogas, methane and electricity cards and bars share **one candidate and one HRT baseline**, rather than different operating points.
- Day / 30-day / 365-day charts and calendar-month reports multiply the same saved daily values. Annual output uses 365 days, without downtime or seasonality.
- Horizontal bars have a shared zero-based scale, proportional widths and HTML labels that retain readable font sizes. Cards and bars adapt to the available container width.
- Existing navigation names and legacy study modes are retained. HRT curves apply only to the older single-input model.
- Server audit records save both model identities, source and input-pool hashes, seed, candidate input/provenance, all 2,000 predictions and their own baselines/gains.
- CSV exports use saved candidate evidence, not a newly evaluated current model. Reports, audit replay and Copilot use the same saved selection.

## Reproduction and verification

Export the already-fitted Python artifact without retraining:

```text
python ai-workflow/src/export_paired_runtime.py
node scripts/model-manifest.mjs
node node_modules/next/dist/bin/next build --webpack
node --test tests/paired-scenarios.test.mjs
node scripts/verify-paired-ui.mjs
```

The export contains coefficients, scalers and the input-only pool in `ai-workflow/research/paired-200-2026-11-07/`. The independent Python parity fixture covers all 2,000 predictions and baselines. Browser verification covers repeated runs, three metrics and three projection periods, the complete CSV, monthly-to-annual reconciliation, audit retrieval/replay, source records, workflow details and chart fit at 320–1920 CSS pixels. Screenshot and test evidence is written under `test-results/paired-scenarios/`.

Published on 7 November 2026 at https://aquaivolt-command-center.vercel.app/. Deployment: `dpl_HFE8vXrcssEtMwTqPzuooxcKdASG` (`paired-2000-chart-layout-20261107`). The bar layout follows the supplied reference, with Baseline / AI optimized / Change vs baseline cards, labels to the left, and values at the bar ends on wide screens. Live verification passed login, three optimization runs, all three outputs, 2,000 CSV comparisons, monthly/annual reconciliation, saved audit replay, Copilot and eight viewport sizes. Evidence is in `test-results/paired-release/verification.json`; deployment metadata is in the adjacent `deployment.json`.
