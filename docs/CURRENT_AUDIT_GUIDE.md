# AQUAIVOLT current technical and audit guide

Updated 10 November 2026. This supersedes the 4 November interface/model mapping. Confirm each record's version, artifact and manifest hashes before replay. Model execution evidence and independent predictive accuracy are different claims.

## Interface to execution mapping

| Interface | API | Calculation |
| --- | --- | --- |
| Overview: same-tank production | POST /api/research/hrt, objective same_tank_gain | same-tank-ridge-500-2026-11-10-v1, trained Ridge on 500 supplied planning rows; 2,000 candidate inputs |
| Audit Trail: ML predictions | POST /api/ml/predict | trained-ml-1.0.0, fitted ONNX Gradient Boosting (10 reference rows, six features) and Ridge (800 rows, eight features) |
| Audit Trail: original scenario tests | POST /api/predict and POST /api/reports/batch | Multi-Input Scenario Ensemble 1.8.0, reference-weighted formulas and seeded search |
| Other research objectives | /api/research/hrt with objective-specific request; /api/research/reactor-search | Versioned hours, workbook, paired or reactor study; use its returned identity |
| Alerts: Early warning | /api/early-warning | Hand-weighted heuristic on 480 generated records, independent fixed alarms, laboratory timing and recorded review |
| Gas monitoring / animated process | /api/monitoring | First 400 sensor-workbook hours, 13 reference rules, versioned snapshots and transitions; original 58-row source retained for historical replay |
| Explicit monitored API (separate from dashboard planning) | /api/monitoring/production?model=hrt or reactor-search | Requires a snapshot header, rejects critical/missing/expired readings and saves a separate context link; never selected automatically by the planning UI |

## Separate optimization and monitoring workflows

Overview, Biogas, Methane, Electricity and AI Optimizer use their selected planning inputs through `/api/research/hrt`. HRT reactor studies use `/api/research/reactor-search`. Monitoring replay is not added to those requests and does not disable them. Their authentication, input validation, model execution and evidence storage remain in force.

Gas monitoring and Lebanon sites show reference-data replay and **IoT sensors: Not connected**. The 60-second expiry check belongs to that monitoring session. The UI distinguishes **Reading expired**, **Missing reading**, **Critical alarm** and **Monitoring unavailable**. Warnings and the animated process diagram stay in the monitoring workspace and Alerts > Gas monitoring & process; they do not appear as a global optimization hold. Running a planning model never acknowledges, clears or changes a monitoring alarm.

Alerts > Early warning has its own flow: readings/laboratory availability → engineering features and six-hour trends → fixed alarms and separate predictive score → review and saved evidence. Current gas monitoring uses the first 400 hours of the same 480-row sensor workbook. Its “AI early warning alarm process” button opens the warning workflow at the matching source hour. Monitoring test overrides and archived v77 readings are not passed as warning inputs. The full 480-hour, six-event evaluation remains unchanged. This separation does not train a new failure model or establish a live equipment connection.

See [MONITORING_SEPARATION_2026-11-10.md](MONITORING_SEPARATION_2026-11-10.md) for repeatable regression checks. Original snapshot fields, hashes and historical evidence remain unchanged; friendly status wording is applied at display time.

## Current Overview model

The same-tank model fits stage one-hot encoding, StandardScaler and Ridge (alpha 10) using stage, AFTER HRT, temperature, pH and sludge-retention time. Targets are biogas and methane percentage. Methane volume and electricity are derived (CH₄ m³/day × 9.97 kWh/m³ × 0.36). A reproducible 400/100 split provides planning-data evaluation, followed by a final fit on all 500 rows. This release adds no retraining.

The dashboard evaluates 2,000 generated candidate inputs, restricts selection to the chosen intervention stage and preserves the source BEFORE comparison. Supplied BEFORE values are 360 hours, 66.15 m³/day biogas, 42.09 m³/day methane and 151.07 kWh/day electricity. R5 requires feed solubilization and biomass retention; R6 remains multi-day. A short selected HRT is a planning result, not proof that the installed plant achieves it.

Held-out planning-data results: biogas MAE 1.48015 m³/day and R² −0.04819; methane MAE 1.92266 m³/day and R² 0.45824; electricity MAE 6.90022 kWh/day and R² 0.45832. The biogas result does not beat a mean predictor by R². These are not independent plant accuracy or measured gains.

Example POST /api/research/hrt request:

```json
{"baseline":{"value":360,"unit":"hours"},"objective":"same_tank_gain","sameTankStage":"R5","retainedMethanePct":90,"targetHours":12}
```

The response records selection seed and model/data/engine identity. POST /api/research/hrt/verify accepts runId. GET /api/research/hrt?runId=<id> restores the result; format=csv exports 2,000 stored evaluations. These are not the 500 training rows. AI & KPI reports restores saved comparisons and exports. Different objectives can use different artifacts.

## Original fitted pipelines

Admin > Audit Trail > ML predictions takes nine explicit values: feedstock, feed rate, temperature, pH, OLR, HRT in days, COD input, VFA and mixing. ONNX Runtime CPU runs the original fitted preprocessing and learned models. Feed rate is context only in both; VFA and mixing are trained features only in Ridge. Raw outputs are gas flow m³/h, methane percentage and generator kW. Daily outputs are derived without a scenario fallback. Different training targets mean the two models are not a before/after pair.

```json
{"operatingConditions":{"feedstock":"Dairy WW","feedRate":846,"temperature":36.5,"ph":7.2,"olr":3.2,"hrt":22,"codIn":7600,"vfa":1100,"mixing":50}}
```

POST to /api/ml/predict. Null/missing values return 422. Identical valid inputs reproduce raw predictions while IDs/times change. POST /api/ml/verify checks eleven execution/integrity properties. GET /api/ml/predict returns the manifest and hashes; use runId and format=csv for prediction export. The original joblib and exported ONNX hashes establish artifact identity. The 674 Python parity cases per model establish export fidelity only.

## Auditor findings and corrective actions

1. **Validation:** artifacts execute and their data/features/results are documented. Plant-validation entry/report tools exist for measured observations linked to saved ML runs. Measured-data training, independent accuracy and demonstrated benefit remain open until equipment, suitable data and a frozen protocol exist. Never populate validation records with generated measurements represented as real.
2. **Listing:** the server enumerates every private-storage metadata page, globally sorts by stored time/ID, then uses a stable cursor cutoff. Refresh starts a new view. Unreadable entries remain visible. Test all pages to the reported total, expected IDs exactly once, and fresh-login direct retrieval. A never-saved historical run cannot be reconstructed as original evidence.
3. **HRT:** show HRT change with signed increase/decrease/unchanged values. Original scenario/ML inputs use days; same-tank research uses hours. Convert at 24 hours/day. A decrease is not automatically a physical improvement.
4. **Authentication:** exports state SERVER_AUTHENTICATED, HMAC-SHA-256 and independentlyVerifiable=false. Hashes check consistency; HMAC authenticates the server record. No public-key or sensor-origin verification is claimed.
5. **Outside-distribution inputs:** pH 11 remains exploratory with OUTSIDE_REFERENCE_ENVELOPE and NOT_CALIBRATED uncertainty. Feedstock reference ranges describe source coverage, not approved plant limits. No calibrated prediction interval is fabricated.

## Retest and evidence

Production uses immutable private Vercel Blob records with verified readback. Records retain request/effective inputs/response, actor, UTC time, UUID, versions, manifest/artifact identities, input/output/record hashes and server HMAC. Structured server logs use run IDs; responses include execution traces. Local file storage is disabled on Vercel.

GET /api/audit?runId=<id> retrieves evidence; format=json or csv exports it. GET /api/audit?limit=50 starts a snapshot. Pass each returned cursor until hasMore=false. Compare count to total, reject duplicates, verify expected IDs, then repeat after a fresh login. New records created while paging appear after Refresh.

In Audit Trail, execute identical ML inputs three times, reject null pH, verify one run, and inspect pH 11 domain/uncertainty fields. Execute the original scenario with a fixed seed and verify it separately. In Overview run the same-tank model, open its saved comparison and verify research replay. Keep these identities and scopes separate in auditor communications.

The warning module is detailed in [EARLY_WARNING_2026-11-10.md](EARLY_WARNING_2026-11-10.md). Its five software checks are independent of the eleven trained-ML checks. [The 400-reading update and Audit Trail checks](MONITORING_400_AND_AUDIT_CHECK_2026-11-10.md) identify the current source subset and unchanged model interfaces. The 400 monitoring readings are not the reactor model's 400 training scenarios.

Software completion requires deployment and recorded tests. It does not imply auditor approval, grant release, live analyzer integration, independent plant accuracy, demonstrated gains, calibrated uncertainty or certified protection. Video remains deferred by request.
