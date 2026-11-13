# Task 2 production release — 8 November 2026

Permanent address: https://aquaivolt-command-center.vercel.app/

Deployment: `dpl_5uENg1KiPKirz5PB9bv11HC5w8XA`  
Previous deployment: `dpl_2QKxfCC9q4j4jt79n953xgStQmY7`  
Release metadata: `task2-hrt-study-20261108`

## Client-visible changes

- Green **NEW · TASK 2** overview announcement and **Open Task 2** shortcut.
- **Task 2** badge beside the existing **HRT in hours** sidebar label.
- New HRT technology study with explicit Task 2 heading, configurable baseline and constraints, before/after comparisons, scenario export and audit verification.
- Existing HRT study remains accessible. The existing Task 1 model and calculations retain the same version, artifact hash, dataset hash and engine manifest hash as before deployment.

## Validation

Local production build and updated browser workflow passed before publication. The previous full backend suite passed 66 tests; this release's presentation changes do not alter calculation logic.

Live production checks passed at `2026-11-08T16:00:05.742Z`:

- Admin login using the existing credentials.
- Overview announcement, sidebar badge and shortcut.
- Task 1 model identities match the pre-release capture.
- Task 2 selects HRT-0163: 360 to 4.8 hours, 23 eligible source scenarios out of 200.
- Daily/annual values reconcile across biogas, methane and gross electricity charts.
- 200-row CSV download succeeds.
- Task 2 record persists in Vercel private Blob storage and passes deterministic replay.
- Five historical audit records remain retrievable with valid integrity; an earlier Task 1 research run passes replay after this release.
- Task 1 optimization still evaluates 2,000 candidates, saves its evidence and renders AI & KPI reports.
- Task 2 restores its saved result after visiting Task 1 and Audit Trail.
- Mobile layout fits the viewport; no browser exceptions were recorded.

Task 2 verification run: `7f19f9e8-c38c-4a14-a607-037db8007e7e`  
Task 1 verification run: `d7ca3166-799f-4e5d-b5b7-073c665542f7`

Evidence: `test-results/task2-release/before.json`, `live.json`, `live-overview-desktop.png`, `live-task2-desktop.png`, and `live-task2-mobile.png`.

The Task 2 assessment limitation remains visible: it ranks 200 original workbook planning scenarios. Generated predictions were not enabled because the predictor did not pass its assessment. This release does not claim measured plant performance.
