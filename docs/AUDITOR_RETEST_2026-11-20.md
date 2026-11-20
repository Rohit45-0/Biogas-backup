# AQUAIVOLT auditor retest - 20 November 2026

This checklist supersedes the 13 November handover's pending credential-rotation status. The existing admin and user credentials were changed on 19 November and their previous sessions invalidated. A dedicated reviewer login, `auditor`, and separate testing administrator, `rohit.test`, are supplied privately. Do not attach passwords or session cookies to technical evidence. Use one reviewer identity per assigned person.

## 1. Security - actual HTTP test

1. Log in as auditor using POST /api/auth/login. Preserve the returned cookie locally as session A.
2. GET /api/audit?limit=1 with A: expect 200. GET /api/auth/session: role must be reviewer.
3. POST /api/auth/logout with A: expect 200 and serverRevoked=true.
4. Replay A against /api/audit?limit=1, /api/ml/artifacts and /api/auth/session: expect 401 for each.
5. Log in again. POST /api/settings, /api/auth/accounts and /api/validation: expect 403. POST /api/early-warning with action review: expect 403. Reviewer model/evidence tests remain allowed.
6. A password change invalidates all earlier sessions for that account. Do not change production credentials as part of an uncoordinated retest; the package contains isolated multi-session rotation tests and live rotation evidence.

## 2. Models - exact binaries and repeatable inference

Open Audit Trail > Auditor review. Download the model verification ZIP and live source identity. The ZIP includes ONNX and original fitted joblib files, SHA-256 file inventory, runner, source data and methodology. Compare ONNX hashes to GET /api/ml/artifacts and to each live prediction.

Run audit evidence checks executes the existing prediction/verification handlers on the server using the caller's session. It saves two ML predictions, the 11-check verification and a review report. It checks null pH rejection, repeatability, historical retrieval and warning-comparison bookkeeping. Its PASS is a software-checklist result, not plant acceptance or authentication of the eight failed records. The separate logout HTTP test is not counted in this button's result.

For an independent external check, use POST /api/ml/predict with the packaged request.json. Repeat exactly. Expect identical raw output values and distinct run IDs. Send null pH: expect HTTP 422 with a ph issue. Send pH 11: retain and inspect out-of-reference-coverage warnings and unavailable calibrated uncertainty; API input bounds are not plant safety limits.

Save the full successful response as response.json and its submitted request as request.json. Run:

    python -m venv .venv
    .venv\Scripts\python -m pip install -r requirements-check.txt
    .venv\Scripts\python independent-model-check.py --models models --request request.json --expected response.json --output comparison.json

On macOS/Linux use .venv/bin/python. Any input/hash/output mismatch must fail. Preserve full precision. The two models have different target definitions and are not a baseline/optimized pair.

## 3. Historical integrity and persistence

Open each entry in the eight-record exception register. Inspect its original payload, content digests and HMAC outcome. Failed entries must display UNVERIFIED; JSON and CSV must carry a failure label, warning, diagnostics and UNVERIFIED-INTEGRITY-FAILED filenames. Failed predictions must not pass verification or download through the verified-results endpoint.

Download the fresh checklist and its linked model/verification records. Log out and sign in again; confirm the new IDs are retrievable directly and in Audit records (paginate if needed). Confirm new records verify. Historical records remain unchanged and unresolved; do not delete or re-sign them.

## 4. Early warning and proposed plant validation

The checklist includes the six-event reference replay and signed lead times versus the FIRST fixed warning or critical alarm. Inspect all six events, negative/zero lead times, missed detections and normal-period advisory hours. A previously inspected workbook is not a fresh holdout; the trend policy is not a trained classifier.

Read PLANT_VALIDATION_PROTOCOL_2026-11-20.md and agree criteria before final testing. Equipment arrival/port status is client-reported; calibration, commissioning and usable measured data have not been independently established.

## Dates and ownership

- 19 November 2026: shared admin/user credential rotation completed and old sessions rejected.
- 20 November 2026 submission: targeted auditor-review update, dedicated accounts, refreshed evidence package and independent reference-model evaluation. Exact deployment and test timestamps are in the release evidence; failed checks must not be represented as complete.
- Requested coordination checkpoint, 23 November 2026: Doris confirms reviewer assignment and commissioning date; auditor/plant engineer review proposed criteria. This is a proposed review checkpoint, not a commitment by those parties.
- After commissioning: developer and plant engineer check acquisition within 5 working days and review pilot data within 10 working days; issue evaluation within 5 working days after the agreed independent dataset is complete. Absolute plant dates depend on confirmed commissioning and required sample size.
