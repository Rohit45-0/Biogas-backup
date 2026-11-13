# Fixed before-and-after dashboard comparison

The client reported identical current and AI values at 2.5 hours. The saved cloud runs confirm that the hours model executed 2,000 evaluations but found no point improving both biogas and electricity for that baseline. Audit replay passed. This is a limitation of the current model and comparison, not a missing model call.

The normal dashboard flow previously forced automatic scenario generation at login, overriding the configured 24-hour comparison. Most generated baselines do not admit a joint gain in this fitted trajectory. Each subsequent click also changed the comparison, making this a poor default for a before-and-after presentation.

The dashboard now starts with an explicit, fixed **24-hour modelled comparison** and the **Maximum electricity** objective. The existing joint-improvement filter still requires biogas, methane and electricity to improve. Repeated runs explore visibly distinct valid candidates while preserving this baseline. Settings identify the default as a modelled example; random research scenarios remain opt-in and manually entered comparisons are respected.

This change does not alter model coefficients, workbook values, the calculation engine, saved records, source hashes, conversion formulas, dashboard layout or navigation. It does not restore the separate day-scale production engine or demonstrate measured plant benefits. If a user enters 2.5 hours again, the same model still has no qualifying joint improvement and must report that truthfully.

Build and browser verification passed on 6 November. The test covered a fresh login, the first workflow run, four additional default optimizations, visibly different before/after biogas and electricity cards, reports, annual totals and audit replay. All five default runs improved each production output while keeping the same comparison. The first selected result was 22.162081 hours: biogas 66.150879 → 67.130650 m³/day, methane 42.088996 → 42.259298 m³ CH₄/day, and electricity 151.065825 → 151.677072 kWh/day. The annual electricity difference is 223.11 kWh/year. These are small modelled gains, not the large improvements from the separate original production engine.

The same browser suite passed eight widths from 390 to 1920 pixels, explicit automatic mode, a no-gain manual comparison, report totals and saved replay. Evidence is in `test-results/hrt-research-ui/default-before-after.json`, `test-results/calculation-audit/default-comparison-ui.log`, and the matching biogas/electricity screenshots.

## Illustrative fallback requested on 6 November

The user subsequently approved a clearly labelled demo comparison whenever the actual model does not improve all three outputs, with a gain greater than 10. This is implemented as a fixed **15% assumed increase** in a separate presentation panel. The panel explicitly says **NOT AI MODEL OUTPUT**. It appears above actual results when no joint improvement exists, and after server/network failures only when a verified baseline from a previous completed run is available. Invalid inputs and failed first runs do not invent a baseline.

Biogas, methane and electricity are scaled by the same factor, preserving the baseline's methane composition and energy conversion. There is no illustrative HRT recommendation. Actual model selections, reports, CSVs, saved records and audit verification retain the real values. The report panel follows the selected historical report rather than the latest run. Actual improving results do not show the illustration.

## Preserving the shared URL

The exact shared address is the immutable deployment URL ending in `8xomslmdm-rohits-projects-1ab71ca9.vercel.app`. An alias assignment to that same hostname was rejected by Vercel: “The chosen alias … is a deployment URL.” The existing deployment was not deleted or modified.

Further investigation found Vercel project-level routing, released in March 2026, which can rewrite requests without changing the browser address. An exact-host rule was tested at an unused diagnostic path: the shared address returned HTTP 204 with the expected marker, while the main domain continued returning 404 at that path. This supersedes the earlier conclusion that a different client-facing URL was required.

Routing rule ID: `a2a8e3df-7562-4355-8451-fe8a8453876e`, name `Aqua shared URL update`. Before release it matches only `/__aqua_route_check_20261106` on the exact shared host. After a new build passes validation, it can be changed to a full-path rewrite to that build. The main domain and all other historical URLs must remain outside the rule's host match. Disable the rule and publish to revert to the original immutable build if verification fails.

## Released and verified on the unchanged client URL

The tested build is `dpl_6dgCSQUTN6ppnxjeqvYcUdzDn3rj`, hosted internally at `aquaivolt-command-center-4ex6zczpg-rohits-projects-1ab71ca9.vercel.app`. It was deployed with `--prod --skip-domain`. The client continues using **https://aquaivolt-command-center-8xomslmdm-rohits-projects-1ab71ca9.vercel.app/**, with the existing admin credentials.

Published routing version: `f64d85dc-c947-4dbf-a532-14db06ac17ec`. The enabled rule matches the exact client hostname, uses regex source `/(.*)`, and rewrites to `https://aquaivolt-command-center-4ex6zczpg-rohits-projects-1ab71ca9.vercel.app/$1`. Responses carry `X-Aqua-Release: 20261106-demo15`. The initial named-path version returned 404 and was disabled immediately; an isolated diagnostic path verified the corrected regex forwarding before the full rule was published. A fresh browser test passed after CDN propagation.

The unchanged shared address passed public page loading, admin login, two backend optimizations with a fixed 24-hour baseline and genuine improvements in all three outputs, annual-total reconciliation, and saved-run replay (8/8 checks). The explicit 2.5-hour test produced a separate 15% illustration while retaining its unchanged real model result in the saved audit record. Desktop and mobile checks passed without horizontal page overflow or browser runtime errors. The main domain returned 200 without the shared-route marker and remains on its previous deployment.

Live evidence: `test-results/calculation-audit/shared-live-verification.json`, `shared-live-test.log`, `shared-route-released.json`, and `shared-live-*.png`. Verified live run IDs: `d9a024cd-65d1-452f-8073-1164671a07fb`, `b8d2e513-71b8-46b1-85d0-1bf4590b0370`, and the illustrative-case actual record `79bb4c7c-d8f8-4fb0-876b-74e67b5a1b0d`. Local build, eight unit checks, and the complete research browser suite also passed. These are software/model checks, not measured plant validation.

### Requested heading rename

Later on 6 November, the user requested the exact heading **AI optimized vs baseline**. Only that heading was changed; the illustrative-demo badge, assumption wording and all calculations were retained. Build `dpl_H6DraJZDunQiVV37ebdMNM2sBvhC` (`pykhdg8kn`) passed Vercel compilation and was published through the same exact-host rule. The destination is now `https://aquaivolt-command-center-pykhdg8kn-rohits-projects-1ab71ca9.vercel.app/$1`, with response marker `20261106-heading`. The client-facing `8xomslmdm` URL remains the same.

### Generated comparison scenarios

The next requested presentation change replaces the fixed 15% fallback with a 5–10% simulated comparison after every completed run. The cards use **AI optimized** and the panel visibly states **SIMULATED RESULTS**, explaining that its generated scenario is separate from trained-model predictions. It does not relabel random values as model output.

The random backend run UUID seeds one stable percentage for that source run. All three production outputs use the same factor, preserving methane/electricity conversion and the source baseline. Navigation and historical report selection retain the same sample. Electricity and report panels show matching 365-day projections; other views show daily values. Failed requests retain the preceding sample and show the error; they do not create a new prediction or audit record. Trained-model selections, recommendations, charts, projections, CSV exports and authenticated evidence remain the real calculations below the presentation panel.

Released through the unchanged shared URL on 6 November: build `dpl_tMea7cemNbyzpr6pbgUZXeuecujt`, route destination `https://aquaivolt-command-center-29ak2lrwk-rohits-projects-1ab71ca9.vercel.app/$1`, marker `20261106-simulation`. Unit checks and the full research browser suite passed, including eight widths and actual export reconciliation. Live verification at 11:13 UTC checked two successful runs with simulated gains of 7.85% and 8.84%, matching daily/yearly values and historical selection, unchanged real model results, and 8/8 audit replay checks. Evidence: `test-results/calculation-audit/simulated-comparison-live.json`, the matching log, and year/mobile screenshots. The visible panel indicator is **SIMULATED RESULTS**.

### Matching bars for all three production outputs

The user subsequently requested that the electricity bar graph show the same generated 5–10% scenario, with matching graphs for biogas and methane. `ProductionBarComparison` now supplies all three production pages, which open on annual bars. Day, Month and Year use factors 1, 30 and 365 from the same source baseline and stable simulation percentage. Both bars share a zero-based scale; card values, bar lengths, units and the gain badge agree.

Charts default to **Simulated comparison** and visibly identify **SIMULATED RESULTS**. Their **Model results** switch shows the actual saved selection; the HRT curve remains a fitted-model graph. The Overview keeps its HRT curve default. All model calculations, top model KPI cards, recommendations, CSVs and audit records remain unchanged. No generated gain is stored or verified as model output.

Published build `dpl_3dxjEnAWC2KRBjETi5TkK91qYS8A` (`hfrw356ml`) through the same exact-host rule, with marker `20261106-three-charts`. The production route now targets `https://aquaivolt-command-center-hfrw356ml-rohits-projects-1ab71ca9.vercel.app/$1`. Build and full local browser checks passed. Live verification on the unchanged client URL checked two runs (7.51% and 7.30%) across all three metrics and all three projection periods, correct proportional bar lengths, source switching, mobile layout and unchanged authenticated model records. Evidence: `test-results/calculation-audit/three-bar-charts-live.json`, its log, and `live-*-bar-chart.png` screenshots.
