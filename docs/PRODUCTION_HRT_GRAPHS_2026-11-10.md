# Production output versus HRT graphs — 10 November 2026

The Biogas, Methane and Electricity production pages now open on their HRT curve view. The overview retains its daily comparison. The same period control still provides the existing Day, Month and Year bars. The separate HRT Optimization model - Reactor Technologies graph remains available.

Each production graph uses HRT in hours on the horizontal axis and its page's daily output on the vertical axis: biogas m³/day, methane m³ CH₄/day, or electricity kWh/day. It plots all 2,000 saved candidate predictions, a blue mean per HRT band, the saved HRT baseline model values, and exact baseline and selected markers. Marker labels include both hours and output. The graph takes the full available content width and adapts its axes and cards to narrow screens.

## Calculation meaning

The paired production comparison evaluates the baseline and the AI prediction at the **same HRT**. These charts retain that fact and show “HRT unchanged · 0 h”. They do not claim a time decrease. Introducing an HRT reduction objective would require a separate calculation change; moving a marker or substituting a shorter baseline would misrepresent the existing run.

The blue trend comprises arithmetic means in up to twelve equal-width HRT bands. Other inputs vary across candidates. It is a descriptive projection of saved multivariate evaluations, not a controlled HRT-only response or a new fitted model. The baseline curve comes from the candidate baselines already saved in the run. No predictions, gains, baselines, selection rules, source data or model identities change in this release.

## Verification

- Seventeen targeted tests pass: all 2,000 production predictions and baseline points for all three outputs; exact selected markers and gain calculations; aggregation; missing and zero baselines; non-finite input exclusion; signed HRT direction; replay consistency; and existing reactor chart cases.
- TypeScript, targeted ESLint and production build pass.
- Local browser checks cover all three default HRT views, switches to Year and back, and a second run changing the selected markers.
- Responsive checks at 320, 768 and 1440 CSS pixels find no document overflow or clipped SVG text.
- Browser values are reconciled against authenticated saved-run evidence and deterministic server replay by `scripts/verify-production-hrt-api.mjs`.

Release evidence is stored in `test-results/production-hrt-chart/`.

## Production release and live verification

- Permanent address: https://aquaivolt-command-center.vercel.app/
- Vercel deployment: `dpl_DP3icwmnccLpFQJntPNKUdRdXrM3`, Ready and aliased to the permanent address.
- Release metadata: `production-hrt-graphs-20261110`.
- Live verification completed at 2026-11-10 06:39 UTC. A fresh optimization produced run `1772b1eb-ca9e-4b65-91fb-165b22ba12aa` with 2,000 candidates. All three production pages displayed the appropriate HRT graph, and the Electricity Year comparison and return to HRT view worked. No browser console errors were recorded.
- All six displayed baseline/selected output values and all HRT marker values matched the authenticated saved record exactly. Server integrity checking returned true and deterministic replay returned PASS. Report: `test-results/production-hrt-chart/live/api-verification.json`; screenshots: `live-biogas.png`, `live-methane.png`, and `live-electricity.png` in the evidence directory.
- Verified daily values: biogas 66.98745513588875 → 95.6917522884152 m³/day (+42.8502577%); methane 42.25744758287465 → 59.49755225370849 m³ CH₄/day (+40.7977899%); electricity 151.6704308644537 → 213.54861454901055 kWh/day (+40.7977899%). Both HRT markers are 22.383308844536884 hours, so the displayed HRT change is 0 hours.
- Engine identity remains `sha256:72dfdcc61ab509f34c2b79c539395c15ab09f4d2e92c1d995cf16550469939d0`. This verifies presentation and saved model calculations, not measured plant performance.

No new video is produced before the user's review of these graphs.
