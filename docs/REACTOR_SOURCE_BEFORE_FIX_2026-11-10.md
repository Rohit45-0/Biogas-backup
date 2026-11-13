# Reactor source BEFORE / AFTER correction

The previous default compared two operating scenarios within the same reactor. Its 10.2-hour (H1) or 6.7-hour (H2) baseline was an existing AFTER HRT, not the source BEFORE reference. The source columns already use hours; this was a comparison-choice issue, not a days-to-hours conversion.

The default is now Source BEFORE → AFTER using exact source values. Both original 200-row files are retained, with 400 file-qualified records. The new source reader resolves named BEFORE and AFTER columns from the preserved extraction and retains file, sheet, row, SHA-256 and unit provenance. It validates that the selected technology's common BEFORE reference agrees across source rows. No numerical HRT baseline or desired percentage is inserted in the runtime calculation.

The default source calculation preserves the file's daily methane and electricity values, including their precision. The model option remains separate: it evaluates 2,000 generated inputs for the selected technology against the same original source BEFORE reference. The previous same-reactor and all-technology comparison modes remain available.

The main reactor graph and saved Audit Trail graph share one component and saved result. The full axis includes the distant original BEFORE HRT. A dashed connector shows the before/after pair without claiming intermediate response predictions. KPI/scenario exports include the baseline's source reference and HRT column names. Historical records are left unchanged. Session restoration uses a new key so an old same-reactor run is not silently presented as the new default comparison.

Production calculations and trained model weights are unchanged. Production pages default to daily output bars; their optional HRT analysis uses one shared input HRT card and an evaluated-input count, avoiding duplicate times labelled as before/after optimization.

Validation: 40 focused tests passed, including all 400 exact source rows, all nine source comparisons, all nine 2,000-candidate model comparisons, graph endpoints, export reconciliation, deterministic replay, and production-model regressions. Release and live verification details will be appended after deployment.

Local production-build verification also passed TypeScript, targeted ESLint, and browser checks for all three reactor outputs, saved Audit Trail rendering, and all three production pages. The source H1 run selected T2-B-0133: HRT 360 → 4.1 hours, biogas 66.15 → 97, methane 42.09 → 64.21, electricity 151.07 → 230.46. The source and model API checks both returned PASS, with 400 and 2,000 candidates respectively, and all displayed endpoints matched saved evidence and exports. Responsive Audit Trail graph checks at 390 and 768 pixels found no horizontal overflow or clipped SVG labels.

An independent read of both original Excel files reconciled every source run candidate's BEFORE HRT, AFTER HRT and three daily outputs (400 records) and confirmed both source-file hashes. Evidence is in `test-results/reactor-source-before/`. The production engine hash remains `sha256:72dfdcc61ab509f34c2b79c539395c15ab09f4d2e92c1d995cf16550469939d0`.

## Deployed and verified

- Permanent URL: https://aquaivolt-command-center.vercel.app/
- Deployment: `dpl_CjB4fXPri6haVxDVtsbmihD4nPEW`, release `reactor-source-before-20261110`, Ready and aliased to the permanent URL on 10 November 2026.
- Live source run `ec0187fc-850e-44dc-9489-0ce01f330758`: 400 source records, selected T2-B-0133, 360 → 4.1 hours (98.8611111% decrease). All three graph metrics and the saved Audit Trail graph matched the exact saved values. Verification returned PASS, including exact BEFORE provenance and AFTER column checks. KPI and scenario CSV values matched the same record.
- Live model run `b9917144-753a-4244-ab1d-e3acfdf41704`: 2,000 generated candidates, selected GEN-H1-f81c9f79-1364, 360 → 4.12672063678876 hours (98.8536887% decrease). Saved replay, source provenance and export reconciliation returned PASS.
- Live production pages defaulted to Day; a fresh production optimization displayed the shared input HRT and the unchanged production comparison. Browser console had no errors. The live reactor graph also passed the 1440-pixel viewport overflow check.
- Evidence: `test-results/reactor-source-before/live/api-verification.json`, live exported CSVs, `live-ui-values.json`, and `live-source-electricity.png`.
