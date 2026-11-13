# Historical Audit Trail guide (4 November 2026)

**Superseded:** use [CURRENT_AUDIT_GUIDE.md](CURRENT_AUDIT_GUIDE.md) for the 10 November application, current Overview model, early-warning workflow and auditor response. The historical mapping below is retained for older runs and must not describe the current Overview.

Source update: 4 November 2026. See [audit remediation and retest checklist](AUDIT_REMEDIATION_2026-10-31.md). Confirm the deployed source/manifest hash before treating these source changes as live production behavior.

## Access and test sequence

Sign in to https://aquaivolt-command-center.vercel.app using the Admin account. Select **Audit Trail** in the sidebar. The normal User account has read-only production views and source metadata; research execution, saved research exports and audit tests require Admin access.

The application exposes three separate execution paths. Do not use one path's model name, HRT units or verification report to describe another.

| Interface | Endpoint | Executed model | HRT input |
| --- | --- | --- | --- |
| Overview, production views and AI recommendations | `POST /api/research/hrt` | Fitted hours-scale research model, `hours-research-1.0.0` | Hours, 2–24 in the UI |
| Audit Trail > ML predictions | `POST /api/ml/predict` | Saved Gradient Boosting and Ridge pipelines, `trained-ml-1.0.0` | Days |
| Audit Trail > Scenario execution / comparison | `POST /api/predict`, `POST /api/reports/batch` | Original Multi-Input Scenario Ensemble 1.8.0 | Days |

### Current dashboard research run

1. In Overview, select **Run AI optimization**. The default mode generates an HRT input within 2–24 hours and saves its replay seed. The fitted model calculates both the generated scenario and the selected recommendation; it evaluates 2,000 candidate points against the chosen goal.
2. To reproduce a manual comparison, open **Study settings**, select **Enter comparison HRT**, enter the HRT and retain the same objective and methane-retention goal. Identical manual inputs reproduce the calculation. Automatic runs are reproduced using the saved request, including its seed and previous HRT.
3. Inspect the signed **HRT change**, production estimates, recommendation values, model/data hashes and run ID. A different input may change the comparison while the same objective still selects the same recommended point.
4. Open the saved run in **Audit Trail > Audit records**, then select **Verify HRT research replay**. Eight checks cover integrity, model/data identity, deterministic replay, units and research status. The report must also say that verification was saved.
5. Download the 2,000 research evaluations and the server-authenticated JSON. These evaluated points are not training measurements. The source is a supplied synthetic workbook; plant performance and calibrated uncertainty remain unestablished.

### Trained ML predictions (default audit view)

1. Select an operating profile or enter explicit values. **Run ML prediction** calls `/api/ml/predict` and executes both trained pipelines: Gradient Boosting and Ridge Regression. There is no scenario fallback or simulation seed.
2. Inspect the actual HTTP status, run ID, raw gas flow, methane content and generator power, daily derived outputs, trained input values, context-only values, artifact hashes and timed execution trace.
3. **Test null rejection** submits null pH and expects HTTP 422 with a field-specific error. Missing operating conditions also return 422; this endpoint never silently substitutes a reference profile.
4. **Verify ML run** reads the server-authenticated stored record and runs both fitted pipelines again. Eleven checks cover record integrity, inputs, model build, artifact identity, trained feature mapping, prediction repeatability and daily unit conversions. The verification report is itself persisted and read back.
5. Download server-authenticated JSON, evidence CSV or Prediction CSV (one row per trained model). Audit records can retrieve an older ML run and reopen it for replay. Replay across a changed model manifest is rejected, while original saved evidence remains retrievable.

These two models use different training data and target definitions. Their outputs are not a baseline/after pair, and no winner is chosen by larger predicted output. Gradient Boosting uses six features and ten fitted reference rows. Ridge uses eight features and 800 fitted rows. Feed rate is context only for both; VFA and mixer speed are features only for Ridge. The UI and records expose this contract explicitly.

### Original day-scale scenario tests

1. **Input & execution:** select a reference profile or adjust the nine values. HRT is entered in days. Keep a fixed seed for reproducibility. Run test 1. Inspect the actual HTTP status, submitted and executed inputs, baseline/optimized outputs, selected inputs, execution trace, and run ID. A storage failure prevents a passing execution status.
2. **Null rejection:** sends an actual request with a null pH. Expected result is HTTP 422 with a field-specific error, not invented output or silently defaulted pH.
3. **Model verification:** run test 2 against the recorded run. The server independently reads the record, checks its SHA-256 hashes and HMAC, verifies the active build, reruns the same engine with the recorded seed, and compares output fingerprints. The verification report is also stored and read back before it is returned as saved.
4. **Comparison:** runs two reference profiles through `/api/reports/batch`, which calls the same execution service as `/api/predict`. Both cases use the same seed and objective weights and receive individual persistent run IDs.
5. **Audit records:** retrieve a run or verification report by ID, inspect its integrity result, or select a stored run for verification. The list enumerates all storage metadata pages before applying global newest-stored-first ordering. Timestamp/ID cursor pages retain a cutoff; Refresh starts a new view that includes newly stored records. Stored time and execution time are shown separately. Unreadable records remain visible as failed entries. Reloading or signing out does not remove stored records.
6. Download server-authenticated JSON, evidence CSV, and the 2,000 evaluated candidate rows. Use Print evidence for the current visible audit section. The candidate CSV is **not model training data**.

## Actual execution architecture

Current dashboard: Admin authentication -> explicit research settings and unit validation -> generated or manually entered HRT -> fitted polynomial research inference -> 2,000-point objective search -> comparison, recommendations and backend trace -> server-authenticated private storage write -> verified readback -> response with RECORDED or NOT RECORDED.

Original scenario tests: authenticated request -> strict input validation/profile resolution -> reference-based TypeScript model -> seeded bounded candidate search -> highest-scoring candidate -> output calculation and timed trace -> server-authenticated private storage write -> verified readback -> response with RECORDED or NOT RECORDED.

The trained ML route instead runs: Admin authentication -> strict explicit input validation -> hash-checked ONNX artifacts -> original fitted preprocessing and learned Gradient Boosting/Ridge inference -> raw predictions -> daily unit derivation -> server-authenticated private storage -> independent readback. It does not invoke the scenario engine or an LLM.

Production uses private Vercel Blob storage linked to the existing Vercel project. Records are never stored only in a serverless process variable or temporary filesystem. Local integration tests use an explicitly configured `AQUA_AUDIT_DIR`; this fallback is disabled on Vercel. Existing older, unrecorded runs cannot be recreated as historical evidence.

Each record contains the request, effective inputs, complete model response, username/role, UTC timestamp, UUID, model version, manifest hash, request/input/response/output hashes, record hash, and server HMAC signature. Server logs contain structured completion/failure events keyed by run ID; the retrievable response contains the model-stage trace. These records attest to what this application executed, not to the provenance of plant measurements.

## Model reconciliation

- Overview `/api/research/hrt`: **hours-research-1.0.0**, fitted degree-five polynomial coefficients over a 2–24-hour source trajectory. The final artifact fits 500 supplied synthetic workbook rows. HRT is its independent input; process settings vary together along that trajectory, not as independently optimized plant controls.
- Original scenario `/api/predict`: **Multi-Input Scenario Ensemble 1.8.0**. It uses 10 embedded paired reference anchors, distance weighting, explicit process formulas, and 2,000 seeded candidate evaluations. Ridge is not used by this endpoint, which no longer supplies Overview.
- Audit `/api/ml/predict`: **trained-ml-1.0.0**, original saved Gradient Boosting and Ridge pipelines exported to ONNX. Their encoders, scalers and learned weights execute through ONNX Runtime CPU. No retraining took place in this integration.
- Export parity against original Python inference passed 674 cases per model, including boundary cases. The exported pipeline and original joblib SHA-256 values are recorded. Parity confirms conversion fidelity, not predictive accuracy.
- The source manifest is regenerated before build and development startup from the model, input contract and model-card source files. The API also supplies a manifest hash and the Vercel deployment identifier.
- Archived Ridge, tree-model and neural-network evaluations are not measured-plant validation. Presentations must distinguish all three execution paths in the table above. The hours-model study is documented in [the research guide](HRT_RESEARCH_GUIDE.md); its synthetic holdout scores do not establish plant accuracy.
- Original scenario objective weights are fixed. Identical inputs and seed reproduce its outputs. Dashboard automatic mode varies the hours-model input and records the seed; it does not perturb predictions or retrain the model on each click.
- The hours model uses hours directly. Original scenario and trained-ML HRT inputs remain in days. Day-to-hour displays multiply by 24; the 2–24-hour research model is a separate artifact, not a relabeling of day-scale results. HRT reduction or physical benefit is not guaranteed.

## API contract

### Current Overview API

`GET /api/research/hrt` returns model metadata, defaults, supported bounds, source/data/artifact/engine hashes and evaluation limitations. `GET /api/research/hrt?view=data` returns the supplied source rows. Admin calculation example:

```json
{
  "baseline": {"value": 24, "unit": "hours"},
  "objective": "shortest_hrt",
  "retainedMethanePct": 90,
  "targetHours": 12,
  "scenario": {"mode": "automatic", "seed": "audit-hours-001", "previousHrtHours": 24}
}
```

Send this to `POST /api/research/hrt`. Omit `scenario` to evaluate the manual comparison HRT, or omit its `seed` to generate a new saved seed. The same full request and model build reproduce the outputs. `POST /api/research/hrt/verify` accepts `{"runId":"<uuid>"}`. `GET /api/research/hrt?runId=<uuid>` retrieves the saved result; add `format=csv` for its 2,000 stored evaluations. Original saved research exports remain available across model updates; replay requires matching artifacts, data and engine.

The Process Monitor shows a visual stage sequence while waiting for the calculation. Its animation is a client-side explanation, not live server-stage telemetry. Completed stages, backend duration and saved-record controls come from the returned result. No connected sensors or equipment commands are implied.

### Original scenario API and streaming support

The original `POST /api/predict` route also supports `Accept: application/x-ndjson`. This is retained API support; the current Overview calls the research endpoint above. The original route reports eight stages: operating conditions, validation, candidate evaluation, production comparison, diagnostics, evidence assembly, audit persistence and response preparation. Fast model stages are forwarded in a batch using their recorded timestamps after execution; this is not continuous per-candidate telemetry.

The stream contains progress messages followed by one final `result` message. Authentication and invalid-input failures retain normal HTTP errors before streaming begins. A storage failure is reported as a warning and `NOT RECORDED`, not a successful saved record. A missing final result is treated as interrupted execution, without replacing previous dashboard results or automatically issuing a duplicate request. Plain JSON clients and Audit Trail tests remain supported.

The completed visualization exposes stage timestamps, returned production estimates, run ID and the actual saved-run candidate CSV. Trace replay is explicitly a client-side review of confirmed stages; pausing replay does not pause the backend or generate another run. No sensor connectivity or additional ML model execution is implied.

`POST /api/predict` requires an authenticated session. Audit Trail scenario tests send explicit operating conditions. Example:

```json
{
  "profileId": "DAIRY-WW-001",
  "operatingConditions": {
    "feedstock": "Dairy WW",
    "feedRate": 846,
    "temperature": 36.5,
    "ph": 7.2,
    "olr": 3.2,
    "hrt": 22,
    "codIn": 7600,
    "vfa": 1100,
    "mixing": 50
  },
  "seed": "audit-test-001"
}
```

The optional fixed seed is Admin-only. Custom inputs receive profile ID CUSTOM when they do not match a stored profile. Null, missing, nonnumeric, unknown, or out-of-physical-range parameters are rejected with 422. Malformed JSON receives 400. `previousRun: null` in a legacy request means there is no earlier comparison, not that the engine executed null inputs: if operating conditions are omitted, the API explicitly resolves and returns the stored default profile. Unsupported profile IDs are rejected.

`GET /api/predict` returns the original scenario pre-run baseline and reference profile. It is not a calculation request. `GET /api/model` identifies the original scenario build, not the hours-model dashboard. `GET /api/evaluation` is explicitly archived evidence.

Admin evidence endpoints:
- `GET /api/ml/predict`: actual load status, trained-model manifest, hashes and runtime version.
- `POST /api/ml/predict` with `{"operatingConditions":{...all nine explicit fields...}}`: predictions from both trained artifacts. Uses the same units as the example above, without profileId or seed. Invalid/null/missing fields return 422, not a prediction with default values.
- `POST /api/ml/verify` with `{"runId":"<uuid>"}`: independently retrieve and replay a saved ML prediction.
- `GET /api/ml/predict?runId=<uuid>&format=csv`: export both actual saved model predictions, units, target basis and hashes.
- `GET /api/audit?runId=<uuid>`: server-authenticated record and integrity result; 404 if absent.
- `GET /api/audit?limit=20&cursor=<cursor>`: record pages.
- `GET /api/validation`: measured-plant evaluation prerequisites and pending status.
- `POST /api/validation` with action `record`: link operator-reported measurements, source, sample ID, timestamp and holdout declarations to an integrity-verified saved ML run.
- `POST /api/validation` with action `evaluate` and `observationIds`: persist MAE, RMSE, bias and R2 for one plant, dataset and frozen model build. Single-observation or constant-target R2 is undefined, not zero or a passing score.
- `POST /api/audit/tests` with `{"runId":"<uuid>"}`: verification and stored report.
- `POST /api/reports/batch` with `{"requests":[<request>,<request>]}`: 2-5 comparisons.
- `GET /api/audit?runId=<uuid>&format=json` or `format=csv`: evidence downloads.
- `GET /api/predict?runId=<uuid>&format=csv`: 2,000 evaluated candidates. Requires the original stored run and matching current model manifest; cross-build exports fail explicitly instead of reconstructing different values.

## Limits and remaining external evidence

Predictions now include `domainAssessment`: per-feedstock bounds derived only from the ten supplied optimization references, unknown fields, explicit outside-envelope warnings, an uncalibrated uncertainty status and null prediction intervals. These are reference envelopes, not validated safe operating limits or a recovered Ridge training distribution. pH 11 remains an exploratory request within the broad API guardrails, but its out-of-reference warning is explicit in the UI, response, stored evidence and CSV. Inputs beyond the API guardrails are rejected with HTTP 422.

Plant validation records require explicit commissioning, real-measurement, input-alignment and exclusion-from-training/tuning declarations. The application cannot independently verify these declarations or dataset completeness. It never promotes a saved measurement or error report to independent validation or an optimization-benefit claim. Real measured before-and-after periods remain required for benefit assessment.

PASS applies to the listed software checks only. It does not establish independent plant prediction accuracy, calibrated statistical uncertainty, realized optimization gains, scientific validity of the reference formulas, or grant approval. Those require measured plant data, traceable provenance, an agreed evaluation protocol and independent review. No live sensors or equipment control are connected.

The evidence signature is HMAC-SHA256 using the server's session secret. It is a server-held integrity mechanism, not a public-key signature or independently certified immutable ledger. Rotating that secret requires a plan for retaining old verification keys; otherwise older signatures will no longer verify. The Blob token must remain server-only. `RECORDED` is issued only after a successful write and fresh verified readback. Storage failure leaves results visible with NOT RECORDED and no passing verification report.

## Verification

`pnpm test` builds production code and exercises authentication, invalid inputs, baseline consistency, candidate/output consistency, deterministic replay, comparisons, exports, tamper detection, process-restart persistence, and storage-failure behavior. `scripts/verify-production.mjs` repeats live checks with credentials supplied through environment variables and writes a credential-free evidence bundle under `test-results/production`.

The tests also execute both native ML models on all 674 Python-generated parity fixtures and cover ML-specific input rejection, feature sensitivity, context-only invariance, signatures, eleven-check replay, CSV and persistent history. `scripts/verify-ml-production.mjs` verifies the deployed ML path separately.
