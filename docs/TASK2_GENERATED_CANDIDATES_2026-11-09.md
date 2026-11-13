# Task 2: 2,000 generated model candidates

User-approved scope: extend the HRT reactor study from evaluating the 400 supplied inputs to generating and predicting 2,000 distinct inputs per AI run. Preserve Task 1, same-reactor comparisons, source data, baseline choices and historical replay. Deployment target remains https://aquaivolt-command-center.vercel.app/.

## Implementation

- Independent engine `reactor-search-2026-11-09-v2`, API `/api/research/reactor-search`, evidence kind `reactor_search` and source manifest `app/lib/reactor-search-build.json`.
- Training data remain the original 400 records across nine technologies. Fitted Ridge weights, model hash and data hash are unchanged.
- Generator `same-reactor-neighbour-interpolation-v1` combines neighbouring input records within one reactor configuration. One interpolation weight is shared across all six numeric inputs. Neighbour distance uses fitted feature scales. Exact source vectors and duplicate generated vectors are excluded.
- Same-reactor mode generates 2,000 inputs for the selected technology. Upgrade mode generates 2,000 across all nine technologies, 222 or 223 each. The fitted model predicts biogas and methane content; methane volume, daily electricity and annual electricity follow the existing conversions.
- Each optimization click supplies a new server-generated UUID seed. Saved seeds reproduce pool hashes, predictions, filtering and selection. The explicitly chosen baseline stays fixed; a fresh seed does not promise an improvement or a visibly different rounded result.
- Selection still requires lower HRT and increased available production for same-reactor mode. Missing baselines stay missing, source COD/VS limitations remain, and an unqualified run has no invented after values.
- Source-scenario mode retains all 400 original records. Original 200-row and 400-row Task 2 APIs remain independently available for historical replay.
- UI distinguishes training records from evaluated candidates, paginates 50 rows, exports all 2,000 evaluations with both source-parent identities and weights, exports seven KPI rows, and shows generation evidence in Audit Trail. Task 1 sidebar now leads with its existing 2,000 evaluations per run.

## Verification

- 91 automated tests passed, including 18,000 generated inputs across nine reactors, independent coefficient inference, physical conversions, unique-input/parent bounds, deterministic replay, seed variation, fixed baseline, eligibility, source mode, invalid/missing inputs, CSV and response size.
- Production build and targeted ESLint passed.
- Local browser verification passed: nine reactors, two fresh runs and seeded replay, Day/Year chart reconciliation, pagination, 2,000-row CSV, seven-row KPI CSV, source Excel, saved evidence, audit replay, manual/no-result/source/upgrade modes, authentication and tamper rejection.
- Seven viewport sizes checked: 1920, 1440, 1280, 1024, 768, 390 and 320 pixels. No page errors or document overflow.
- Local example H1: 2,000 generated/evaluated candidates, 1,086 qualified, unchanged 10.2 h baseline, 4.133379937555779 h selected. The JSON response was 2,105,871 bytes. Values vary with saved seed.
- Local Task 1 run and both legacy Task 2 engines passed. Their metadata and older saved records are checked again after publication.

Evidence: `test-results/reactor-search/local/verification.json`, desktop/mobile screenshots, `test-results/reactor-search-tests.log`, build/lint logs. Pre-release Task 1 paired-model proof is `test-results/scenario-counts-20261109/before.json`, run `562fec25-5450-44ab-b4d4-2ec63281cd91` (2,000 unique inputs; saved replay PASS).

## Interpretation

This expands inference coverage; it does not retrain on 2,000 observations. The existing model failed its held-out biogas performance gate, and generated input comparisons remain exploratory. Range inclusion, saved-run integrity and reproducibility do not establish plant accuracy, causal gains or safe plant operating limits. The auditor guide documents these limits and the steps to check each run.

## Production verification

Published to the existing permanent address, deployment `dpl_Hd6yvppeH1vAMVvdrQsYqbghWHPV`, release `reactor-generated-2000-20261109`. Production verification completed **2026-11-09 17:02:15 UTC** with no browser errors. Model engine identity matched the local build: `sha256:310d38f5de7efe96a320ddd0f00181ee3b3802f6742d147ada63a96f1f436ba2`.

Live run `16c6d646-90d8-4848-b945-f14b78acf009` generated 2,000 candidates, of which 1,068 qualified. Its 10.2-hour H1 baseline stayed fixed and the selected HRT was 4.134183375318116 hours. A second fresh run used a different seed/pool; posting the saved first seed reproduced its original output hash. All nine technologies were exercised: C1 correctly returned no qualifying candidate for its default starting point; the other eight qualified in the tested runs.

The 2,000-row CSV, seven-row KPI export, source workbook, audit retrieval/replay, manual/no-result/source/upgrade modes and seven responsive sizes passed on production. The audit list separately contained 16 new generated-study records with valid integrity; direct retrieval agreed with the listed ID and 2,000-row count.

Task 1 and previous 400-row Task 2 metadata were identical to pre-release captures. Historical 200-row and 400-row Task 2 saved runs and the pre-release Task 1 paired run replayed successfully. New Task 1 smoke run: `122f607f-99d4-488f-810d-673965208d50`; legacy 200-row smoke run: `c3304998-70ae-4b0a-94e2-b4d19a0b55a2`; previous 400-row smoke run: `70dd8733-67ea-49d9-9e7e-6c8e767839e6`.

Evidence: `test-results/reactor-search/live/verification.json`, `test-results/reactor-search/live/listing.json`, screenshots and `test-results/reactor-search-deploy.log`.
