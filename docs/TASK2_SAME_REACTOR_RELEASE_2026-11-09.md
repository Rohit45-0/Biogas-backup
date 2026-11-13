# Task 2 same-reactor release — 9 November 2026

Permanent address: https://aquaivolt-command-center.vercel.app/

Release metadata: `task2-same-reactor-20261109`. Deployment: `dpl_JB8KeMuTtcsvG4y57ARYnXhrRMQ3`. Previous deployment: `dpl_EfQCNVs4e8gTKRLV3YD1vn1maueA`.


## Delivered behavior

- A merged workbook preserves all 400 records, original values, file hashes and Excel-row provenance. Unique file-qualified IDs avoid the repeated scenario numbers in the two source files.
- Same-reactor optimization evaluates a fixed chosen baseline and candidate inputs with the same reactor-specific model and configuration. Technology upgrades remain a distinct source-comparison mode.
- Four responsive before/after comparisons show HRT, biogas, methane and gross electricity. Daily/annual views, KPI exports beside the results, all-400 exports, row counts and operating-input differences share the saved calculation.
- Audit Trail has a Task 2 reactor-test workspace, nine technology profiles, retrievable run evidence, server integrity/replay verification and downloadable auditor instructions.
- The crossed-out NEW overview label was removed; Task 2 remains identifiable beside the existing navigation label. Alerts use the merged source coverage while retaining the unresolved CSTR loading-unit limitation.
- Task 1 calculations and the original Task 2 endpoint and replay version remain unchanged. Original evidence is retained.

## Verification

84 backend tests passed. Production build, targeted lint, and Graphify update completed. Local and production browser checks cover all nine technologies, seven screen sizes, all four charts, missing/manual baselines, no qualifying candidates, source/model methods, technology upgrades, audit replay, exports, downloads, restoration and Task 1 reports. Local tests also cover role restrictions and refusal of tampered records.

Live verification completed: 2026-11-09T15:00:58.740Z. No browser exceptions recorded.
Merged workbook SHA-256: f2d84aefcba6506f8fccb4c61ab878ede0f6c13ab9e20940143f09c89000384d. All 400 × 36 raw/provenance cells were independently compared with the source extraction; formula counts sum to 400.

Task 1 live check: 8a4b898a-acc2-4b4d-9dee-6e158a280727. Original Task 2 check: 45a69a6f-5d84-4ef9-8e85-88bb2b6c72b2.
Historical replay and integrity checks passed for: eb0f3ed3-e2d3-4532-96cb-ddb8868742de, 98f2b124-287f-48b7-a183-ec51ce189e7a, 19563d32-4d21-466f-afbd-f0fd74d78698, b3ed13b1-efbc-4697-a8c8-64f643783d3d, 65cb6b94-626b-4b45-8067-910ff671a5e7. Both historical API metadata objects exactly match the pre-release capture.

## Default same-reactor results

These compare fitted predictions at existing source inputs, not measured before/after plant outcomes. The starting record is the first source row per pathway, without outcome screening. A minimum-HRT objective does not maximize production gains.

| Reactor | HRT before (h) | HRT after (h) | Biogas gain (%) | Methane/electricity gain (%) | Saved run |
|---|---:|---:|---:|---:|---|
| H1 | 10.200 | 4.100 | 0.087 | 0.051 | 53b352a8-b3ec-4432-8199-95fdc4ec6a10 |
| H2 | 6.700 | 5.500 | 0.010 | 0.049 | 139376fc-ef73-49c7-8bc7-56b88bd5c08f |
| H3 | 11.000 | 6.700 | 0.190 | 1.839 | 9c5c158e-3531-41a4-ae63-b5e157ee70d1 |
| H4 | 70.400 | 49.200 | 0.540 | 0.381 | 97403589-36a7-4f2a-a491-c5db7cd08a40 |
| H5 | 35.300 | 33.600 | 0.014 | 0.068 | 83d4c711-f7c2-433d-9836-326172bf57ab |
| H6 | 57.600 | 26.300 | 0.341 | 1.091 | f3ec421e-5f84-4a02-ac4b-6b6662e78d46 |
| C1 | 81.600 | — | — | — | cc4e0df4-6a32-4959-81d0-eab58c469cc8 |
| C2 | 136.900 | 107.700 | 0.043 | 0.093 | f002d907-8b71-4d0b-9531-f92c22c706f9 |
| C3 | 78.500 | 69.700 | 0.011 | 0.001 | 58ee7f00-75ed-45fe-bfc4-90dca2a12dab |

The C1 default has no qualifying candidate. No fallback changes the baseline or invents an improvement.

## Model limitations

The new reactor-specific standardized Ridge models are fitted using operating inputs only. Related original scenario numbers stay together in validation splits; hyperparameters are chosen inside training data. CSTR organic loading is excluded because the supplied COD/VS units conflict. Methane volume and electricity are derived consistently from predicted biogas and methane fraction.

The biogas model failed its performance gate: grouped random-holdout R² ≈ −0.143 and ordered-holdout R² ≈ −75.57. Accordingly, predictions are explicitly exploratory and restricted to supplied source input combinations; novel generated inputs are disabled. The source prescribes biogas gains by scenario number and does not demonstrate a causal response to operating changes. Neither this release nor successful audit replay establishes plant accuracy or realized benefit.

Data hash: `sha256:e593d938b73b75d1a6d9f0953f1e48e266e4d9027b35e8c83b560efc1c55df30`. Model hash: `sha256:bb775cfae3b5a84e741867d42d2c99f70069aa384c0d561537ebcecfd04136ee`.

Auditor instructions: `docs/TASK2_AUDITOR_GUIDE_2026-11-09.md`. Evidence: `test-results/reactor-study/` and `test-results/reactor-unit-tests.log`. Original sources and fitted artifacts: `ai-workflow/research/reactor-study-2026-11-09/`.
