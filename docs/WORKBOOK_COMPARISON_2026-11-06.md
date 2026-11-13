# Workbook biogas baseline and model scenario selection

This records the initial workbook-baseline release. The subsequent [separate energy-study release](SEPARATE_OPTIMIZATION_STUDIES_2026-11-06.md) preserves its biogas comparison and adds a distinct modelled 2-hour methane/electricity comparison.

The default dashboard now compares model-predicted biogas with the supplied hours workbook's `Baseline Biogas (m³/d)`, consistently 50 across all 500 source rows. It no longer uses the model prediction at 24 hours as the default baseline. Manual and automatic HRT studies remain available in Study settings.

Each workbook-mode request runs the unchanged fitted model over 2,000 HRT points. It filters for biogas output at least 1.5 times the workbook reference. The current artifact produces 956 qualifying points, spanning 2–12.510255 hours and approximately 50.01–69.94% predicted biogas gain. Selection starts with the highest biogas output and uses a coprime stride through the qualifying set. Passing the preceding selected HRT visits every qualifying point before the cycle repeats. A fresh session starts a new cycle. This is rotation among qualifying alternatives, not a new global optimum on every click.

Biogas, methane, methane percentage, electricity and operating conditions all come from the same selected model point. Methane is biogas multiplied by methane fraction; electricity is methane multiplied by 9.97 and 0.36. Model coefficients and source data are unchanged. No random presentation uplift is used for workbook-mode results.

The workbook supplies no paired baseline methane, electricity, operating conditions or HRT. Those baseline values and corresponding gains remain unavailable; they are not inferred from the selected point, set to zero or taken from the former 24-hour example. The interface shows the real selected methane/electricity predictions. The supported 50% claim applies to biogas against the synthetic workbook reference, not to all outputs or measured plant performance.

Saved evidence includes the baseline source, qualification rule, selected gain, cycle index/stride, all 2,000 evaluations and selected model point. Output hashing includes the workbook comparison. CSV exports mark the baseline basis, biogas gain, qualifying candidates and selected candidate. Unsupported baseline HRT and changes are blank. Monthly and annual projections use the same saved outputs and supplied baseline, with missing energy baselines preserved.

Validation: all 956 selections without repeats, full-cycle wraparound, model parity, unchanged legacy HRT behavior, missing-baseline and integrity checks; production build; authenticated API, CSV, Copilot and audit replay; all three production pages and periods; report totals; workflow execution; desktop/tablet/mobile layout. The existing full research browser suite also passes.

Local evidence: `test-results/workbook-comparison/local-verification.json`; cycle coverage: `tests/workbook-comparison.test.mjs`. Deployment verification is saved separately in `test-results/workbook-comparison/live-verification.json` after release.

## Published and verified

Deployment `dpl_E8hDTywqSDqVcZs1uqJCFokcuyTX` (`emmxak9vp`) is Ready. The existing exact-host route `a2a8e3df-7562-4355-8451-fe8a8453876e` now rewrites the client address `https://aquaivolt-command-center-8xomslmdm-rohits-projects-1ab71ca9.vercel.app/` to this build. The source remains `/(.*)` and the client-host condition is preserved. Response marker: `X-Aqua-Release: 20261106-workbook-baseline`. Previous destination: `hfrw356ml`; restore that destination and publish the routing change to roll back.

Verification passed through the unchanged client address at 17:02 UTC on 6 November 2026. Successive runs selected 2, 3.5077538769 and 5.0155077539 hours with biogas gains of 69.943860%, 68.497139% and 65.876125%. A fourth run via the workflow also selected a different qualifying scenario. Login, all three production charts and projection periods, missing energy baselines, saved report totals, 2,000-row CSV with 956 qualifying flags, audit integrity/replay, Copilot and responsive layouts passed. Live run IDs and screenshots are retained under `test-results/workbook-comparison/`.
