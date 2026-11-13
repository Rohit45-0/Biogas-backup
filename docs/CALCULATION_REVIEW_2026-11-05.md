# AI improvement and report calculation review — 5 November 2026

## Finding

The repeated “no improvement” results in the supplied screenshots are reproducible. They are not caused by the daily-to-yearly multiplication. The active hours model compares two points on one fitted **optimized-output** trajectory. Lower HRT generally gives more biogas but a lower methane fraction. Since electricity is derived from methane volume, this can reduce electricity even while biogas increases.

The requested selection rule requires biogas and electricity to both increase. With the default shortest-HRT objective and 90% peak-methane goal, 16 of 221 starting HRTs tested in 0.1-hour increments qualify: 22.5–24.0 hours. The other 205 retain the current scenario and have an actual AI improvement of 0%. Automatic mode samples the entire supported HRT range, so repeated zero-gain reports are expected. Changing the labels cannot establish a positive gain.

## Source and calculation checks

- Used Graphify to trace the source reader, fitted model, request and selection logic, result-integrity checks, report projections, CSV exports and historical report selection.
- Compared all seven original workbook hashes against `source-inventory.json`: all match. The two SCADA template files are duplicate copies, not additional training observations.
- Compared 500 original hours rows, 12 mapped fields per row (including ID), against `hours-data.json`: all match, including percentage normalization and the preserved biogas baseline.
- Checked 20 Python coefficient-export parity cases against the active TypeScript predictor, tolerance 1e-9: all pass.
- For all 221 starting HRTs, checked the current point, selected point and 2,000 candidates for methane/electricity reconciliation, and checked result integrity.
- Checked current and selected monthly totals for all three volume/energy outputs against annual totals. Calendar month lengths sum to 365. All reconcile within 1e-7 before display rounding.
- Source cached methane/electricity outputs have small residuals relative to recomputation from already-rounded source columns: maximum 0.006611 m³ CH₄/day and 0.00242 kWh/day respectively. These are consistent with source rounding and cannot explain the large earlier electricity decline.

Formulas:

```
methane m³/day = biogas m³/day × methane percentage / 100
electricity kWh/day = methane m³/day × 9.97 kWh/m³ × 0.36
annual amount = daily amount × 365
monthly amount = daily amount × calendar days in the month
AI improvement = selected amount − current amount
AI improvement % = 100 × (selected − current) / current
average power equivalent kW = electricity kWh/day / 24
```

The energy factors are supplied in the original ten-run workbook’s **Assumptions & Audit** sheet. H₂S concentration differences are in ppm and are not accumulated over months. Average power equivalent is not an installed generator rating. A zero current denominator or unavailable comparison has no calculated percentage; it is not reported as 0%.

## Screenshot reproduction

Default shortest-HRT objective, methane-retention goal 90%:

| Current HRT | Current biogas m³/day | Current methane m³/day | Current electricity kWh/day | Selected HRT | Outcome |
|---|---:|---:|---:|---:|---|
| 5.4 h | 82.5474 | 34.4102 | 123.5052 | 5.4 h | Current retained, 0% gain |
| 14.8 h | 72.9830 | 41.6037 | 149.3242 | 14.8 h | Current retained, 0% gain |
| 16.5 h | 71.5651 | 41.7984 | 150.0228 | 16.5 h | Current retained, 0% gain |
| 17.9 h | 70.4177 | 41.9355 | 150.5149 | 17.9 h | Current retained, 0% gain |
| 20.6 h | 68.2571 | 42.1893 | 151.4259 | 20.6 h | Current retained, 0% gain |
| 24 h | 66.1509 | 42.0890 | 151.0658 | 19.4987 h | Both improve |

At 5.4 hours, 34.4102361 × 365 rounds to **12,560 m³ CH₄/year** and 123.5052194 × 365 rounds to **45,079 kWh/year**, matching the screenshot. At 2 hours, the fitted model predicts 84.9719 m³/day of biogas but only 32.2013% methane: 27.3621 m³ CH₄/day and 98.2079 kWh/day. This explains why selecting 2 hours in earlier versions reduced electricity.

## Workbook baseline versus current scenario

The hours workbook contains **Baseline Biogas (m³/d) = 50** in every row. Its separate **Optimized Biogas (m³/d)** column is the model’s production training target. The dashboard’s current output is a prediction at the entered or generated HRT, not the workbook’s 50 m³/day reference. Both meanings are now explicit in the source table.

The same hours sheet does **not** contain paired baseline methane percentage, baseline methane volume or baseline electricity. Its CH₄, methane and electricity columns describe the optimized trajectory. It would be unsupported to invent a baseline methane fraction, silently reuse the selected fraction, import a different day-scale regime, or swap current and selected totals to guarantee a benefit.

The supplied 50 m³/day reference supports a separate biogas-only workbook comparison. A complete before/after energy comparison needs a compatible, explicitly supplied baseline methane fraction (or baseline methane/electricity measurements) and a defined baseline operating point. Until then, current-versus-selected HRT remains the supported dashboard comparison.

The day-scale scenario engine and archived Gradient Boosting/Ridge models remain separate. They were traced for context but were not retrained, changed or substituted into the hours dashboard. This review verifies software calculations and source provenance, not plant performance or independent model accuracy.

## Corrections

1. Stable **AI selected methane**, **AI selected electricity** and **AI selected biogas** headings replace repeated outcome text in report cards and monthly headers.
2. An **AI improvement** summary shows actual biogas, methane and electricity changes, percentages and annual gains. Zero gain is shown as 0%, with one explanation that the current scenario was retained. Small positive gains below 0.01% remain visibly positive.
3. History rows show the calculated AI improvement percentage. Projection CSVs include signed amount and percentage changes; existing totals and audit statuses remain intact.
4. Report history no longer displays a page-level HRT/outcome summary belonging to the latest run while an older run’s report is selected.
5. Dashboard model description comes from the fitted artifact metadata, replacing the incorrect hardcoded “Quadratic Ridge” description. The active model is polynomial degree 5, ridge 0.1.
6. The original-source table distinguishes baseline and optimized biogas. The H₂S monthly header identifies the filter concentration decrease.

No source values, model coefficients, optimizer improvement constraints or saved audit records were altered to force positive results.

## Historical deployment comparison (additional client request)

Checked sign-in on the 14 comparison URLs from the existing delivery list and the latest `23lgd9wme` URL. Eight accepted the known admin login; seven retired comparison URLs returned HTTP 410. The retired copies were not represented as successfully tested. Available deployment metadata and full test responses are retained in `test-results/calculation-audit/historical-deployments.json` and `historical-calculations.json`.

The original **Multi-Input Scenario Ensemble 1.8.0** is still present at `/api/predict`, including in the current deployment. Running profile `DAIRY-WW-001` with seed `calculation-review-20261105` on the rebuilt September version (`p86kbib4y`), the restored older dashboard (`bh8go3qqn`) and current deployment (`23lgd9wme`) returns identical production amounts:

| Original production engine | Current | AI selected | Unit |
|---|---:|---:|---|
| Biogas | 3,073.0214 | 4,091.2734 | m³/day |
| Methane | 1,792.2168 | 2,740.8691 | m³ CH₄/day |
| Electricity | 1,089.0274 | 1,463.0592 | kWh/day |

These are **day-scale model** results with the original operating profile, not the hours workbook’s 50 m³/day reference. This test moves HRT from 22 to 24.6 days; it does not demonstrate hours-scale retention. The original engine predicts generator power from its reference scenarios. They cannot be substituted into the 2–24-hour dashboard while retaining that dashboard’s units, trajectory and methane-to-electricity calculation.

The earlier hours deployments (`9f5x7w6bj`, corresponding to 2 November, and `b6oeuj6ec`, corresponding to 4 November) contain exactly the same model artifact and dataset hashes as current `23lgd9wme`. For a 20.6-hour starting point and the default 90% goal, they select 7.87694 hours: biogas increases from 68.2571 to 79.8119 m³/day, but electricity decreases from 151.4259 to 136.5408 kWh/day. For a 5.4-hour starting point, that same selection increases electricity but decreases biogas. The old selection rule optimizes HRT subject to the methane goal; it does not require both outputs to improve. The current joint-improvement rule retains the baseline in both cases, as requested earlier.

This confirms two separate changes: the main dashboard migrated from the original production model to the hours model, and later the hours optimizer gained the requirement that both outputs improve. The original production calculations have not been deleted. Restoring them to the main dashboard requires choosing that day-scale mode explicitly, rather than silently mixing the two scientific regimes.

The reviewed UI build is available at `https://aquaivolt-command-center-2t476k7bd-rohits-projects-1ab71ca9.vercel.app/`. Vercel reported Ready with no deployment protection, and live admin login and the 5.4 h, 20.6 h and 24 h API cases passed. The canonical live alias was not moved.

## Candidate variation with a fixed baseline

The user requested silently skipping unsuitable candidates and varying the displayed result when possible, then explicitly chose to keep each generated baseline. The backend now filters the same 2,000 evaluated points for the methane-retention goal and a positive gain in biogas, methane and electricity. A repeat request includes the previous selected HRT. When available, a complete candidate whose displayed production values differ from the previous selection is ranked first, using the requested shortest-HRT or maximum-electricity objective within that alternative set. This is exploration of qualifying alternatives, not a guarantee of a new global optimum on every click.

All selected values and derived daily, monthly and annual totals come from that one fitted scenario. No output is independently inflated, no baseline is regenerated to force a gain, and the source data, coefficients and energy conversion remain unchanged. If there is no qualifying point, the original comparison is retained. If there is no visibly different qualifying point, the best eligible result repeats. An explicit target HRT remains exact. The saved request, selection metadata and engine fingerprint preserve replay of this behavior.

Validation covers five repeated selections against the same 24-hour baseline, maximum-energy alternatives, no-gain 13.5/20.6/2-hour cases, an exact target, a unique feasible peak, fixed automatic seeds, output reconciliation, audit replay and Copilot explanations. Browser checks verify the repeat-request wiring and existing responsive views at eight widths. UI layout, labels and styling are unchanged by this backend update.

Released to `https://aquaivolt-command-center-8xomslmdm-rohits-projects-1ab71ca9.vercel.app/` (deployment `dpl_57xvbxea99NJRH49ZrRrtevZaWYA`). Vercel reported Ready with no deployment protection. Hosted checks passed: public page and admin login HTTP 200, a fixed 24-hour baseline selected 19.498749 then 20.126063 hours with different jointly improving outputs, a 13.5-hour baseline stayed unchanged, and saved-run verification passed. The canonical domain was not moved. Results are saved in `test-results/calculation-audit/candidate-deployment-verification.json`.

## Reproduction

From the active repository:

```
python -X utf8 scripts/inspect-research-sources.py <original-workbooks-directory>
node scripts/audit-research-calculations.cjs
node --test tests/research-improvement.test.mjs tests/research-result-integrity.test.mjs
pnpm run build
node --test tests/hrt-research.test.mjs
pnpm run test:research-ui
```

Read-only extraction and audit results are written to `test-results/calculation-audit/`. Source workbooks are never saved or modified.
