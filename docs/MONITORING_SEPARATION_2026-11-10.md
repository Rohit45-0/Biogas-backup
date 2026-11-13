# Optimization and monitoring separation — 10 November 2026

## Corrected behavior

A stored monitoring snapshot previously redirected dashboard model requests through a monitoring guard. After 60 seconds without a new replay sample, that guard could block both the AI Optimizer and HRT even though their model inputs were independent planning data.

Dashboard model requests now call their own endpoints directly. Monitoring status and errors are local to the monitoring workspace. Production and HRT runs retain authentication, model-specific validation and persistent audit records. Running a model does not resolve any alarm.

| Workspace | Inputs and execution | Result |
| --- | --- | --- |
| Overview / Biogas / Methane / Electricity / AI Optimizer | Selected planning inputs, POST /api/research/hrt | Model predictions, comparisons and saved model evidence |
| HRT in hours | Reactor study inputs, POST /api/research/reactor-search | Source comparison or trained-model search, according to the chosen calculation method |
| Gas monitoring / Lebanon sites | 58-row reference data, /api/monitoring | Readings, thresholds, alarm history, animated process and saved monitoring evidence |
| Alerts > Early warning | 480-row workbook and explicit laboratory timing, /api/early-warning | Independent fixed alarms, heuristic predictive advisory and recorded review |

The explicit `/api/monitoring/production?model=hrt|reactor-search` API remains available for callers who deliberately attach `x-aqua-demo-snapshot`. It still rejects critical, missing and expired readings with HTTP 409. The dashboard planning pages do not automatically use that route. A successful planning result is not authorization to operate equipment under an active alarm.

## Interface wording

- Monitoring uses “Reference data replay,” “Start monitoring session” and “Threshold settings.”
- Missing, expired and failed retrieval states have distinct descriptions instead of “Unknown.”
- The connection status reads “IoT sensors: Not connected.” Site markers do not imply an active hardware connection.
- The sidebar uses “Lebanon sites”; its page is “Lebanon sites & connections.”
- The animated process is a monitoring view with a link to its own saved evidence. It does not report production-model permission or model outputs.
- Alerts includes a separate four-step predictive warning flow. The existing heuristic, data provenance and reference-threshold limitations remain explicit.

No model was retrained and no passwords or authentication settings were changed. Historic snapshots, internal status codes and evidence hashes are preserved. The original `demo_*` audit kinds and snapshot header are retained for compatibility; display wording does not rewrite historical records.

## Client check

1. Refresh the application and sign in as Admin.
2. Open Gas monitoring, choose Start monitoring session, then Auditor tests.
3. Select `stale`. Confirm “Reading expired” and paused process animation.
4. Open AI optimizer and run AI optimization. Confirm a calculated result with a saved run ID, without a monitoring-hold banner.
5. Open HRT in hours, select “AI model · 2,000 generated scenarios” under Calculation method and run HRT optimization. Confirm a result and its own saved ID.
6. Return to Gas monitoring. The expired reading remains recorded. Repeat with `missing` and `h2s-critical`; planning runs remain independent while the monitoring condition stays visible.
7. In Alarm history acknowledge an alarm. Acknowledgement must not clear an ongoing condition. Apply `normal` to record recovery.
8. Open Lebanon sites. Confirm separate site data and “IoT sensors: Not connected.”
9. Open Alerts > Early warning. Confirm the independent four-step flow and use Evaluate & save evidence. Its result must not reuse the gas-monitoring snapshot or change a planning result.
10. Sign out and in again. Retrieve saved model reports and monitoring evidence separately.

Automated checks: `pnpm run build`, `node --test tests/*.test.mjs`, `node scripts/verify-monitoring-ui.mjs` and `node scripts/verify-early-warning-ui.mjs`. Browser regression checks also cover an unavailable restored monitoring record, exact endpoint/header isolation, source values, retained alarm snapshots, reduced motion and mobile width. Explicitly monitored API checks must continue returning 409 for held readings.

## Release verification

Deployed to https://aquaivolt-command-center.vercel.app/ on 10 November 2026. Final deployment: `dpl_BRj74sq9BMmjPLNCyqMnJghNbTLt`.

- Production build and 144 automated tests passed.
- The monitoring browser suite passed locally and on production: 12 independent model runs across Overview, AI Optimizer and HRT with critical, missing, expired or unavailable monitoring; retained alarm snapshots; explicit monitored-route rejections; warning evaluation; report retrieval after login; mobile layout and no browser runtime errors.
- The 16-check early-warning browser suite passed locally. The final production suite also evaluated and saved an early-warning result independently.
- Visual review identified and corrected a CSS conflict that compressed the process schematic inside Alerts. Targeted desktop/mobile checks and the final live browser height check passed.
- Ten production access, input-validation and historic-evidence checks passed. Both existing account passwords work. All five original auditor records plus an earlier monitoring snapshot remained retrievable and authenticated.

Saved browser evidence is in `test-results/monitoring-separation-live/result.json` in the working checkout. Existing unrelated historical HMAC exceptions were not re-signed or altered by this change.

Developer note: Graphify query/update were attempted, but Windows Application Control blocked `graphify.exe`. The graph cache could not be refreshed on this machine; application builds, tests and deployment completed successfully.
