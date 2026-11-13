# 400 monitoring readings, warning entry and model audit checks

## Monitoring source

New monitoring sessions use `monitoring-sensor-400-2026-11-10-v2`: the first 400 distinct hourly records of the supplied `AQUAIVOLT_AI_Predictive_Failure_Early_Warning_Dataset1.xlsx`, in original order. Dates run from 1 October 2026 00:00 through 17 October 2026 15:00. The workbook's original SHA-256 is `4bb784a9b82798e4cf10def94838eb78cda4b27fe0f850f5e9138165b0e9a3d8`.

Gas values, feed, temperature, pH, electrical values and COD are copied from those source rows. COD removal is calculated from inlet/outlet COD. The unused electrical-equivalent gas estimate is derived from kW, methane fraction, 9.97 and 32% efficiency and is not a separate measurement. Future labels, hidden true gas and injected-scenario labels are excluded from the monitoring rows. Source data remains generated reference data, not live plant measurements.

The map badge, source selector, replay boundary, source CSV and alarm crossing counts all refer to the same 400 actual rows. No duplication or new data generation is used to inflate the count. The 480-row early-warning calculation and complete six-event evaluation remain unchanged; the 400-row monitoring prefix does not include the final sensor-drift event.

The reactor model's 400 training scenarios and the production model's 500 planning records are separate sources. This update does not retrain or replace any AI model.

## Warning process button

“AI early warning alarm process” replaces “Start animation.” It opens Alerts > Early warning, selecting the corresponding workbook hour for an unmodified current-source reading. The operator uses Evaluate & save evidence there; navigation itself does not claim to have executed or trained a model. Test overrides and archived-source readings do not silently substitute into warning features.

Process motion starts automatically when a reading is available and pauses on critical, missing or expired data. Pause motion / Resume motion controls only the diagram and respects reduced-motion preferences. The warning button remains available even while motion is paused. Production and HRT optimization remain independent of monitoring replay.

## Historical evidence

The original `demo-monitoring-1.0.0` 58-row source remains unchanged. Snapshot version determines its source, hash, row limit, fixture values, verification and CSV export. Twelve captured original production snapshots and their recorded response hashes are frozen as regression fixtures; all must replay exactly.

Current browser storage uses a versioned key so a previous automatic 58-row replay does not replace the current 400-row view. An auditor can still explicitly restore an archived record from Saved sessions; that view correctly shows its original count. New source data requires a new version rather than rewriting this version's recorded source.

## Audit Trail retest

Use Admin > Audit Trail:

1. Under ML predictions, run the same inputs three times. Both fitted Gradient Boosting and Ridge must return identical raw outputs and artifact hashes, with distinct saved IDs.
2. Select Verify ML run. All 11 execution and integrity checks must pass.
3. Select Test null rejection. Missing pH must produce HTTP 422.
4. Under 1. Scenario execution, Run test 1, then Continue to test 2 and Run test 2. All nine scenario checks must pass. This remains the original scenario engine, not the trained-ML endpoint.
5. Under HRT Optimization model - Reactor Technologies, choose the AI model calculation method, run HRT optimization and Verify saved run. Confirm 2,000 generated candidates and a recorded reactor-model result.
6. Run Overview optimization. In Audit records retrieve its ID and Verify HRT research replay. Confirm same-tank production evidence and its model/data hashes.
7. Confirm all new model and verification IDs appear in Audit records. Download server-authenticated JSON.
8. Sign out and in, then retrieve those IDs again. Integrity must remain valid.

The repeatable browser script is `node scripts/verify-audit-models-ui.mjs`. It supports isolated local tests or explicit production testing using `AQUA_UI_BASE_URL` and `AQUA_UI_PASSWORD`. It does not submit generated observations into Plant validation.

These checks establish execution, deterministic replay and retrievable evidence. They do not establish predictive accuracy or measured plant improvement. Existing unrelated historical HMAC exceptions are not re-signed or hidden.

## Completed production verification

Deployed on 10 November 2026 to https://aquaivolt-command-center.vercel.app/ as deployment `dpl_8vj2oG4ZvBsRsp2tPFFgDSzCV6eZ` (READY). Final production checks completed at 17:00:31 UTC / 22:30:31 IST.

- Production build and all 148 automated tests passed.
- Seven live monitoring checks passed: actual 400-row source/export, replacement button, matching early-warning hour, map count, current and archived record verification, and mobile/runtime checks.
- Ten live Audit Trail workflow checks passed. These include 11/11 fitted-ML verification checks, 9/9 original scenario checks, 7/7 reactor checks and 9/9 same-tank production checks.
- The tested new model and verification records appeared in the visible list and remained retrievable with valid integrity after logout/login. Null pH was rejected with HTTP 422. Three identical ML requests returned identical raw predictions and model hashes.
- The archived 58-row record `cbdbdb1b-4f4e-4573-8247-f0f1d63524bb` still passed all nine monitoring verification checks. Twelve captured historical snapshots also retained their exact replay hashes in regression testing.

Retrieve these IDs in Audit Trail > Audit records:

| Evidence | ID |
| --- | --- |
| Fitted Gradient Boosting + Ridge run | `253f050e-546f-4295-bdc7-05f32420489c` |
| Fitted-ML verification, 11/11 | `b070e21f-bae9-46a7-86e8-e4a481ef665e` |
| Original scenario run | `711230b3-cc75-4a9b-b1a3-e1e3c8109272` |
| Original scenario verification, 9/9 | `00ec0a57-a1ab-4fc0-9603-44a1775bb8dc` |
| Reactor model run | `e82c9585-13c3-45db-b28d-653430ea929e` |
| Same-tank production model run | `dc171242-8909-427d-aaf1-47853eca31ae` |
| Same-tank verification, 9/9 | `df792321-0c65-4355-8f3e-5f8402350d97` |
| Current 400-row monitoring snapshot | `3106f081-e2a0-4b2e-9386-e0e9abee7876` |
| Monitoring verification, 9/9 | `13895cd5-b827-41e0-9066-5d9c5d7c65e3` |
| Separate early-warning assessment at hour 400 | `8a695e76-87e7-4b90-a136-34828da15071` |

Machine-readable results: [AI model checks](evidence/monitoring-400-2026-11-10/audit-models-live.json) and [monitoring checks](evidence/monitoring-400-2026-11-10/monitoring-400-live.json). These are test reports; original server-authenticated records are available from Audit Trail using the IDs above.

Developer tooling limitation: Graphify query/update was attempted, but Windows Application Control blocked its executable. The graph was not rebuilt; the application build and tests were unaffected. No passwords or model artifacts were changed by this release.
