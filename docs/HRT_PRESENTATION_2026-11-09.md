# HRT presentation correction — 9 November 2026

Permanent URL: https://aquaivolt-command-center.vercel.app/
Deployment: `dpl_8dd7ZT7cfijNarQCdscQRbkDtJLA`.
Release: `hrt-reactor-presentation-20261109`.

- Overview and HRT page heading: **HRT Optimization model - Reactor Technologies**.
- Overview action: **Open HRT optimization**, with a separate arrow immediately to its left pointing at the button.
- Comparison selector: **Reactor 2 technologies in comparison**, replacing the old **Baseline source** label.
- The reactor study's visible copy uses source/scenario terminology instead of “workbook”; source files, API identifiers and original audit evidence remain unchanged.
- A prominent **Export KPI report** button sits beside the generated report heading, production-chart controls and scenario table. The download contains the saved run's seven KPI rows.

Production build and targeted lint passed. Local and live browser checks passed at 1440-, 390- and 320-pixel widths, including same-reactor model, source-value and technology-upgrade views, real KPI download, exact heading/label checks and arrow placement. No browser exceptions were recorded.

Live verification: `2026-11-09T15:36:41.719Z`. All three API metadata objects (Task 1, original Task 2 and reactor study) match the pre-release capture. The H1 calculation output hash matches the earlier stored result, and historical run `53b352a8-b3ec-4432-8199-95fdc4ec6a10` still passes replay.

Evidence: `test-results/reactor-presentation/`, including before/after screenshots, downloaded KPI CSVs and live verification JSON. Refresh an already-open browser tab to load the new client bundle.
