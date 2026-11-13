# Separate biogas and energy optimization studies

The default workflow evaluates the unchanged hours model at 2,000 HRT points and saves two independent selections. It does not combine their outputs into a single operating point.

| Study | Baseline | Selection rule | Qualifying points |
| --- | --- | --- | --- |
| Biogas | Supplied workbook biogas reference, 50 m³/day | Predicted biogas at least 75 m³/day | 956 |
| Methane and electricity | Fitted model prediction at 2-hour HRT | Both methane and electricity at least 50% above that model baseline | 1,070 |

The energy baseline is **modelled**, not measured plant production or a methane/electricity baseline supplied by the workbook. At 2 hours it predicts 84.971930 m³/day biogas, 27.362063 m³ CH₄/day and 98.207918 kWh/day. The maximum-energy candidate is at 22.162081 hours: 67.130650 m³/day biogas, 42.259298 m³ CH₄/day and 151.677072 kWh/day. Methane/electricity rise by 54.444851%, while biogas falls by 20.996675% within that energy study. This trade-off remains visible on the production pages, optimizer, reports, Copilot and audit evidence.

The first run selects the maximum biogas and maximum energy points in their respective pools. Subsequent runs traverse each qualifying pool with a coprime stride, preserving each baseline. This is variation among qualifying alternatives, not a different global maximum on each click. The biogas cycle has 956 points and the energy cycle 1,070; each wraps after visiting its whole pool. A fresh session restarts both cycles. Model coefficients, source rows, methane conversion and electrical efficiency are unchanged. No random uplift is applied.

## API and evidence

`objective: workbook_gain` now returns `energyComparison` alongside the existing `workbookBaseline` and biogas `selected` point. Each operating point retains its complete and internally consistent biogas, methane, electricity and conditions. `previousSelectedHrtHours` advances the biogas selection; `previousEnergySelectedHrtHours` advances the energy selection. The latter is checked against the supported 2–24-hour range. Manual and automatic HRT comparison modes retain their existing rules and do not gain an energy-study fallback.

The saved output hash includes the full energy comparison. Replay recomputes both selections and their baselines; unit reconciliation checks both energy points and the biogas selection. Historical evidence is preserved and can still be exported. Records from earlier engine builds require that build for replay.

The 2,000-row CSV retains `selected_scenario` for the biogas selection in workbook mode and adds `energy_selected_scenario`, energy baseline values/basis, per-candidate energy gains and `energy_50pct_qualifies`. No candidate row mixes operating points. Projection CSVs and report summary cards aggregate per-metric values from the separate studies; `study_scope`, the energy baseline/selected HRT and the energy-study biogas change make that distinction explicit. The existing projection `selected_hrt_hours` and H₂S columns describe the biogas study. Monthly totals use calendar-month lengths summing to 365; annual totals are daily output multiplied by 365.

## Validation

Calculation coverage traverses all 956 biogas and all 1,070 energy selections, checks wraparound, exact model parity, unchanged workbook reference, positive energy gains, negative energy-study biogas change, energy conversion, deterministic replay and tamper detection. Browser verification covers repeated runs, all three production pages, all period selectors, curve values, report totals, monthly exports, 2,000-row exports, saved audit records/replay, Copilot, workflow execution and responsive widths from 390 to 1920 pixels. Run artifacts are written under `test-results/workbook-comparison/`.

These remain synthetic-model studies. Neither comparison establishes measured plant accuracy or demonstrated plant improvement.

## Electricity improvement card follow-up

The third electricity comparison card now shows **AI improvement vs baseline**, calculated as `(selected / baseline - 1) × 100`, instead of displaying the fixed 36% conversion assumption. This is a display-only change; electricity calculations retain their existing efficiency assumption. Build `dpl_H189YXLyj8MKB6BRWHQkDhRoaTfb` (`889frfhzk`) is published through the same client-host route with release marker `20261106-improvement-card`. The previous destination was `8ly0au74u`. Live browser verification at 18:12 UTC on 6 November 2026 confirmed +54.44% then +54.35% on successive runs, consistently across Day, Month and Year. Proof: `test-results/workbook-comparison/improvement-card-live.json`; screenshot: `electricity-improvement-card-live.png` in the same folder.

## Published and verified

Deployment `dpl_pWBppVgCNYsuu6EU1zU2XBMp157C` (`8ly0au74u`) is Ready. The existing exact-host route `a2a8e3df-7562-4355-8451-fe8a8453876e` was published with destination `https://aquaivolt-command-center-8ly0au74u-rohits-projects-1ab71ca9.vercel.app/$1`, source `/(.*)` and the unchanged client-host condition. The client URL remains `https://aquaivolt-command-center-8xomslmdm-rohits-projects-1ab71ca9.vercel.app/`. Release marker: `X-Aqua-Release: 20261106-separate-studies`. The previous destination was `emmxak9vp`; restoring that exact-host destination and publishing routes rolls back this release.

Live browser verification through the unchanged client URL passed at 17:59 UTC on 6 November 2026. Successive biogas gains were 69.943860%, 68.497139% and 65.876125%; corresponding independent energy gains were 54.444851%, 54.348805% and 54.080436%. A fourth workflow run also advanced both selections. Verified login, model results, all three charts and periods, report/CSV reconciliation, both saved selections, 2,000 evaluation rows, 956 biogas/1,070 energy qualifying flags, audit replay, Copilot and responsive layout. The first live run was `c6f19c84-947e-44a8-9cf7-ab1d46c6b33f`; complete proof and screenshots are in `test-results/workbook-comparison/live-verification.json` and its sibling images. Local calculation tests, authenticated API tests, the full existing HRT browser regression suite and the production build also passed.
