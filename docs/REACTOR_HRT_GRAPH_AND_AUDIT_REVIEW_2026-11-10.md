# Reactor HRT graph and audit review — 10 November 2026

## Released change

- Permanent address: https://aquaivolt-command-center.vercel.app/
- Deployment: `dpl_HKKghzr6VzUbVBP3yL69HEWJFEy7`, production READY.
- Release metadata: `reactor-hrt-chart-audit-20261110`.
- Production verification completed: `2026-11-10T03:06:02.602Z` / 08:36 IST.

The HRT reactor study and its saved Audit Trail evidence now include a responsive comparison graph. It supports Biogas, Methane and Electricity, exact baseline/selected markers, explicit units, signed output change and explicit HRT direction. Source mode, model mode, same-reactor studies, technology upgrades and no-qualifying-candidate results retain their distinct meanings.

The graph uses the saved candidate outputs, with no new prediction or gain adjustment. The blue line joins arithmetic means in up to 12 equal-width HRT bands. Other inputs vary, so this is a descriptive summary rather than a fitted HRT-only causal curve. Upgrade studies only plot the selected technology's candidates and identify the different baseline technology.

Remaining reactor UI “HRT reduction” labels were changed to “HRT change”, calculated as selected minus baseline. Audit export wording now explicitly says server-authenticated and distinguishes server HMAC integrity from independent public-key verification. The auditor guide has been updated. Historical stored evidence and machine-readable fields are preserved.

## Files involved

- `app/lib/reactor-chart.ts`: exact saved values, technology filtering, HRT-band means and signed changes.
- `app/components/ReactorHrtChart.tsx` and `reactor-hrt-chart.css`: responsive graph and disclosures.
- `app/components/HrtOptimizationStudy.tsx`: main study integration and HRT wording.
- `app/components/ReactorAuditEvidence.tsx`: retrieved saved-record graph.
- `app/components/AuditTrail.tsx` and `audit-ui.tsx`: server-authenticated export wording.
- `tests/reactor-chart.test.mjs`: chart data and edge-case regression checks.
- `scripts/verify-reactor-chart-ui.mjs`: browser, API and audit-remediation verification.
- `docs/TASK2_AUDITOR_GUIDE_2026-11-09.md`: graph interpretation and signed HRT change.

## Verification evidence

- Build, TypeScript and targeted ESLint passed.
- All 98 tests passed. The chart checks cover exact values for all 2,000 candidates, non-mutation, weighted band means, upgrades, missing/zero baselines, no selected result, increase/decrease/unchanged HRT and CSTR hour-scale domains.
- Production browser checks passed at widths 1,920, 1,440, 1,024, 768, 390 and 320 pixels, with no document overflow or SVG text clipping in the tested layouts.
- Three output tabs matched the saved API values exactly.
- Default generated-model, source CSTR, no-qualifying-candidate and technology-upgrade cases passed.
- Saved graph retrieval and deterministic HRT replay passed for run `11d66786-a33f-4d6b-8269-d2dfe04801a2`.
- Audit snapshot `2026-11-10T03:04:54.521Z`: 595 records, 595 unique identifiers, 12 pages of 50 except the final 45. A record written during traversal was excluded from that snapshot and appeared after refresh.
- Visible audit list pagination increased 20 to 40 rows. Visible Refresh included the newly created run `62704ff9-d19d-4a46-be40-de5edcd0e0e1`.
- Evidence JSON returned integrity true, `SERVER_AUTHENTICATED`, `HMAC-SHA-256`, `SHA-256` and `independentlyVerifiable: false`. Evidence CSV retained the verification disclosure fields.
- Plant validation API remains `INDEPENDENT_PLANT_VALIDATION_PENDING`.
- Original ML audit input with numeric pH 11 returned `OUTSIDE_REFERENCE_ENVELOPE`, no calibrated uncertainty and no validated operating ranges. Saved CSV retained the warning. Null pH was rejected with HTTP 422. Run: `f997a045-ba55-473a-b7be-8ec5b2801cbe`.
- CSTR loading-unit coverage remains `UNAVAILABLE` / overall `PARTIAL_CHECK`, rather than inventing a COD/VS conversion.
- Scenario out-of-range dashboard notification and return to an in-range example passed.

Evidence files: `test-results/reactor-chart/live/verification.json`, `browser-live.log`, `deploy.log`, `tests.log`, `build.log`, `tsc.log`, `lint.log`, `graphify.log`, and desktop/mobile graph screenshots under `test-results/reactor-chart/live/`.

The full listing check did not replay every historical calculation. The live checks created synthetic test runs, not plant observations or validation approvals. Audit record totals may increase after the recorded snapshot.

## Preserved engine identities

All four identities match the hashes captured before this graph change:

| Engine | Source hash |
| --- | --- |
| Hours research | `sha256:72dfdcc61ab509f34c2b79c539395c15ab09f4d2e92c1d995cf16550469939d0` |
| Original HRT optimization | `sha256:08f9326a39971dc44e50bed3efbf3dcf6c95b704d8e8a435bf311ca278587256` |
| 400-scenario reactor optimization | `sha256:8874c6313cb5f289679637f5a16e70bf547012fc6f309c9ec34513aa08aaa7e2` |
| 2,000-candidate reactor search | `sha256:310d38f5de7efe96a320ddd0f00181ee3b3802f6742d147ada63a96f1f436ba2` |

## Limits that remain material

The current reactor model has not passed its held-out biogas accuracy gate. Its random-holdout biogas R² is about −0.143; the supplied planning data does not establish validated plant response. The new graph does not remedy that scientific limitation.

The existing measured-observation validation workflow links to the original Audit Trail `ml_prediction` records. A reactor-specific measured-output/run mapping is still needed before that workflow can validate reactor predictions. Real optimization benefits require comparable measured before-and-after evidence, separately from prediction-error statistics.

Reference envelopes are supplied-data coverage checks, not validated operating limits or a complete multivariate OOD detector. Calibrated prediction intervals remain unavailable. PLC/IoT is not connected.

Client-ready response: `outputs/audit-review-2026-11-10/Aquaivolt-auditor-response.md`.
