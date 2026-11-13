# Early-warning workflow and audit evidence

Release: 10 November 2026. Entry: Alerts > Early warning. The existing animated process view remains in Alerts > Gas monitoring & process and in Gas monitoring.

## Implemented calculation

The source is AQUAIVOLT_AI_Predictive_Failure_Early_Warning_Dataset1.xlsx, SHA-256 `4bb784a9b82798e4cf10def94838eb78cda4b27fe0f850f5e9138165b0e9a3d8`. Its 480 hourly rows represent generated sensor and laboratory inputs across six injected events. It supplies a hand-weighted heuristic, not a trained failure classifier. Source provenance is retained. The worksheet is appropriate evidence that the workflow calculates and records results, not evidence of measured plant performance.

The application recomputes engineering features and scores rather than displaying cached workbook scores. It uses only current/past inputs. Future onset labels, hidden true gas flow, injected scenario names and train/test labels are excluded from inference features. They are used only for retrospective evaluation.

Engineering calculations: COD removal = (inlet − outlet)/inlet × 100; OLR = feed m³/h × 24 × COD mg/L / 1,000 / 90 m³; HRT = 90 m³ / feed m³/h; gas/power residual compares measured/generated kW with gas × methane fraction × 9.97 × 0.32. The VFA/alkalinity ratio uses the supplied HAc and CaCO₃ bases and is a proxy, not validated FOS/TAC.

The versioned score sums: base 10; 95 × max(0, ratio − .22); 4 × max(0, −six-hour pH change × 10); 2.2 × max(0, −six-hour methane change); 5 × max(0, OLR − 2); 5 × max(0, 36 − temperature); .1 × max(0, H₂S − 80); .65 × max(0, residual − 8); 8 × max(0, 6.2 − kW). It rounds and clamps to 0–100. These are heuristic points, not calibrated failure probabilities. TAN is contextual and is not a term in this supplied score.

## Three independent decisions

1. Fixed alarms compare known inputs against 13 versioned illustrative rules. Their warning and critical states remain visible even if the predictive score is unavailable.
2. Predictive advisories use score 55–74. A score below 55 is below the advisory threshold, not proof of a safe plant.
3. High-risk advisories use score 75 or greater and require recorded operator review. They can coexist with fixed critical alarms. Review creates a separate immutable record linked to the assessment; it does not clear the condition or command equipment.

No control command, emergency shutdown, ambient gas exposure protection, SMS/email delivery or industrial safety certification is implemented by this module. Gas leaks, overpressure, personnel exposure and electrical faults require independently engineered protective systems. H₂S outlet values describe the process gas stream, not ambient occupational exposure.

## Laboratory timing

Workbook proof mode explicitly reproduces the supplied generated hourly values. Actual sample and result times were not supplied; this mode does not pretend that laboratory values were measured hourly.

Laboratory timing mode accepts each field with value, sampledAt, availableAt and maxAgeHours. Both timestamps require an explicit UTC offset. Results unavailable at decision time, future samples, stale samples and missing samples cannot contribute. Invalid numbers, reversed timestamps and invalid age policies return HTTP 422. The source timezone was unspecified; UTC is a relative replay-clock convention only.

The supplied test fixtures assume sample collection six hours before the decision, result availability two hours before, and a 12-hour maximum age. These are test assumptions, not an approved laboratory sampling policy. Operators can edit all values/times. In timing mode, insufficient six-hour sensor history also makes the predictive score unavailable. Known fixed alarms still run. No trained model or live equipment ingest is introduced by this input form.

## Evaluation and its limits

All 480 recomputed scores and critical-alarm classifications match the workbook. Its historical comparator alerts when score ≥55 and no critical fixed alarm is active. It produces 7 true-positive hours, 5 false-positive hours and 65 missed positive hours among 72 twelve-hour positive labels (9.72% hourly recall). It detects 2 of 6 injected events before a critical alarm: acidification and ammonia inhibition. These are simulated workflow results, not plant accuracy.

Complete events are retained in their chronological partitions: four events in 336 training-designated hours, generator derating in 72 validation-designated hours, and gas sensor drift in 72 test-designated hours. No event overlaps partitions. This is retrospective replay of an already supplied heuristic, not a claim of independently unseen model validation. There is only one event per family and no independent site. A separate pre-failure false-positive assessment excludes each injected onset through event end, inclusive. The six-hour At_Onset flag does not define the full fault interval.

A future learned classifier requires measured event data, frozen feature/label definitions, sampling-time-aware features, complete event or independent-site holdouts, model selection using development data only, calibration evaluation, missed-event and false-alarm rates, and lead-time distributions. It must remain advisory. Training and independent plant validation have no completion date until suitable measured data exists.

## API and audit procedure

All routes require login. Saving, reviewing, verification, history and direct evidence access require Admin. GET `/api/early-warning` returns source metadata, thresholds, policy and replay summaries. POST accepts these actions:

```json
{"action":"evaluate","input":{"index":79,"mode":"workbook"}}
```

Index is zero-based, so this is source hour 80. The fixed critical alarm and high-risk advisory must both be visible. Use `mode:"laboratory"` with a `labs` object to test timing; an empty object must yield unavailable score rather than zero. Each laboratory field (codIn, codOut, vfa, alkalinity, tan) needs `{value,sampledAt,availableAt,maxAgeHours}`.

Other actions: `evaluate_events`; `verify` with runId; `review` with runId, channel (`advisory` or `fixed_alarm`) and note. Verification checks authentication/integrity, current rule manifest, deterministic replay, feature allowlist and absence of equipment actuation. Five passes establish these software properties only.

GET `/api/early-warning?runId=<id>` retrieves a saved assessment/evaluation/review/verification. Add `format=json` for export. `view=history` returns a filtered page of the global audit index and its cursor. Continue all pages, including empty filtered pages. Refresh starts a new snapshot. The global Audit Trail also indexes these records. `format=source_csv` exports the original 480 rows, including evaluation labels clearly named as such.

Each save retains the request, effective features/lab decisions, output, rule/source/policy identities, actor, timestamps and UUID. SHA-256 fingerprints and server-held HMAC provide server authentication, not independent public-key verification or authentication of plant measurements. Storage failure returns an error; successful persistence is not invented.

## Repeatable checks

After building, run `node --test tests/early-warning.test.mjs` and `node scripts/verify-early-warning-ui.mjs`. Tests use isolated local storage and generated fixture credentials. The integration suite covers all 480 source scores, timing failures, independent alarm channels, immutable review, replay, fresh-login retrieval, and listing across more than 50 records. Browser checks cover the visible workflow, exports, existing animated process access and mobile width. Explicit production verification uses the same scripts with configured environment credentials; no credentials belong in a delivery package.
