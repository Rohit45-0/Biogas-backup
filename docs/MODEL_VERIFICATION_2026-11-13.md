# AQUAIVOLT — independent verification of deployed ML

Prepared 13 November 2026. Scope: exact fitted artifacts and reproducible inference.

## Where the models execute

Audit Trail → ML predictions calls POST /api/ml/predict. It executes BOTH saved fitted pipelines with ONNX Runtime CPU 1.23.2. It does not train during a request and does not substitute scenario outputs when loading fails.

The Overview same-tank model, reactor/HRT studies, original scenario engine and early-warning rules are separate implementations. The two original ML models below are not a baseline/optimized pair. Their target definitions differ.

| Model | Artifact SHA-256 | Fitted data | Trained features |
|---|---|---|---|
| Gradient Boosting | 51022e0cdcdbc75ed041a04e19c5c45d6f6a6af8f164040a165cd914351519b4 | 10 optimization reference rows; After-AI reference targets | feedstock, temperature, pH, OLR, HRT, inlet COD |
| Ridge Regression | 8d5c8d68e1a8fb482d340bb719478af4382f1f7fea45cb86187bdef88e364c57 | First 800 rows of a 1,000-row SCADA template | feedstock, HRT, OLR, temperature, pH, inlet COD, VFA, mixing |

These are reference/generated source data, not commissioned plant measurements.

## Inputs, preprocessing and outputs

POST a JSON object containing operatingConditions: feedstock (string), feedRate, temperature (°C), ph, olr (kg COD/m³/day), hrt (DAYS for this endpoint), codIn (mg/L), vfa (mg/L), mixing (RPM).

The application validates all nine fields. Feed rate is recorded as context and is not a trained input to either artifact. VFA and mixing are context only for Gradient Boosting. The registry provides exact tensor names, categories, feature order, scalar types, and fitted preprocessing.

The ONNX artifacts contain the fitted category encoding, numeric scaling and regressor. Numeric input tensors are float64, shape [1,1]; category tensors are strings, shape [1,1]. The tree conversion preserves the saved pipeline's float32 tree-input behavior after preprocessing. Do not scale, encode or reorder the raw fields outside the artifact.

Raw outputs are gasFlowM3h (m³/h), methanePct (%), generatorKw (kW). Derived quantities are gas ×24, gas ×24 ×methanePct/100, and power ×24. Raw outputs are not clipped to make them look plausible. Reference-coverage warnings and unavailable calibrated uncertainty remain in API responses.

## Training and evaluation evidence

The archived evaluation used a chronological first-800/final-200 split for Ridge. Its held-out R² values were -0.015847 (gas), 0.005509 (methane) and -0.016905 (power). These weak scores are disclosed; successful software execution does not improve them.

Inspection of the supplied fitted pipelines confirms Ridge alpha=3.0. Gradient Boosting uses a separate regressor per output, 180 estimators, learning_rate=0.035, max_depth=2, min_samples_leaf=1 and random_state=42. The package includes the complete extracted estimator/preprocessing parameters. These are the fitted artifacts' parameters, not those of a later research comparison script.

The ten-row Gradient Boosting evaluation used leave-one-out validation. Archived MAE was approximately 9.58 m³/h gas, 1.38 percentage points methane and 3.94 kW power. Ten reference rows do not establish generalization to a plant.

The current ONNX conversion loads the existing trusted joblib pipelines, exports preprocessing and learned parameters, and does not refit. Python-to-ONNX parity was checked on 674 cases per model including tree boundaries. Absolute tolerance is 0.0001 plus relative tolerance 0.000001.

The delivery includes the original joblib files, exported registry, archived evaluation, export source, per-file checksums and the available research assessment code. Later research comparison code must not be mistaken for the original training procedure. An original training transaction log / immutable original training Git revision is not established by the archived artifacts. The current deployment revision identifies the software serving these exact files.

## Reproduce without the application

1. In Audit Trail → ML predictions, download Ridge ONNX, Gradient Boosting ONNX, Model registry and Independent Python runner. Put both ONNX files and manifest.json inside a folder named models.
2. Download the saved API record JSON for an ML prediction and save it as live-response.json. Save its submitted request separately as request.json. Keep the full numeric precision.
3. Create a Python virtual environment and install numpy and onnxruntime==1.23.2.
4. Run:

   python independent-model-check.py --models models --request request.json --expected live-response.json --output comparison.json

5. The runner verifies both artifact hashes before inference, checks input equality and compares each raw output against the live response using the registry tolerance. Any mismatch exits unsuccessfully.
6. GET /api/ml/artifacts provides the deployed source revision, deployment ID, normalized runtime-source file hashes and artifact links. Compare these with SOURCE_REVISION.json and CHECKSUMS.json in the delivery package.

A PASS proves artifact/inference agreement only. It does not prove plant accuracy, measured production gain, certified alarm limits or equipment readiness.

## Endpoint audit checks

- Anonymous request: HTTP 401. Dashboard-only user: HTTP 403. Individually assigned reviewer: model tests and evidence access allowed.
- Null pH: HTTP 422. Repeated identical inputs: identical model values, different run IDs.
- pH outside reference coverage: explicit coverage warning; calibrated prediction intervals remain unavailable.
- Logout then replay the copied cookie: HTTP 401, including after server restart.
- Saved audit record: request, effective inputs, outputs, UTC time, actor, source/manifest hashes and component digest/HMAC checks.
- A failed-integrity record is an UNVERIFIED_HISTORICAL_RECORD. Its original content is retained. It cannot pass model verification or be exported as a verified model result.
