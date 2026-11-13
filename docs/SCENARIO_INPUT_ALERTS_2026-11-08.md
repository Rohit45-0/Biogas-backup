# Scenario input notifications — 8 November 2026

Permanent address: https://aquaivolt-command-center.vercel.app/

## Behaviour

- Completed Task 1 and Task 2 optimization runs automatically check the selected scenario's operating inputs. Manual comparison HRT entry is also checked against the existing trajectory's supported hours.
- An out-of-range value creates an amber notification across dashboard pages, an active count beside Alerts and on the bell, and a record in the browser session's notification history.
- Warnings show the input, actual value, unit and source-data range. Acknowledgement hides the banner but does not clear an unresolved warning. A subsequent valid check resolves it; missing inputs do not silently clear it.
- Repeated identical warnings are deduplicated. History survives refresh within the same browser session, is separated by username, and is invalidated when the source-range catalog changes. It is not a shared server alert log.
- Open **Alerts → Try out-of-range example** to demonstrate the notification. **Load in-range example → Check scenario inputs** resolves that example. These controls only submit a range check.
- The Alerts page also accepts scenario input values and displays the latest automatic checks. Network failure produces an explicit monitoring-unavailable message.

## Range basis

Task 1 uses observed input ranges for each supported pathway in the 200-row source workbook underlying its 2,000-candidate pool. The older HRT trajectory checks only its 2–24-hour input. Task 2 uses the observed ranges of each of its nine reactor pathways, with HRT in hours, SRT in days and explicit loading units.

The CSTR source has conflicting COD/VS loading units, so that loading check remains unavailable; other available fields are still assessed. Task 2's 360-hour baseline reference and user-specified optimization constraints are not treated as selected operating inputs.

These are scenario data-coverage ranges, not validated plant safety limits. Checking individual fields does not establish joint input coverage. PLC / live plant data is not connected. The feature does not change model calculations, training artifacts, scenario selection or saved evidence.

## Validation

- Production build and targeted ESLint checks passed.
- All 74 backend tests passed, including eight new alert tests and checks covering every Task 1 pool input and all 200 Task 2 source scenarios.
- Browser tests passed for notification creation, actual value/range display, counts, duplicate suppression, acknowledgement, correction, session restore, missing inputs, network failure, unresolved units, automatic Task 1 and Task 2 checks, and reports.
- Alert layouts fit 1440-, 390- and 320-pixel viewports without page overflow; desktop and mobile screenshots were visually reviewed.
- Existing Task 2 browser regression passed: daily/annual chart values, 200-row CSV, audit verification/listing, tamper rejection, role boundaries, input changes, no-candidate handling, seven screen sizes and Task 1/report compatibility.

Evidence: `test-results/scenario-alerts/`, `test-results/scenario-alerts-tests.log`, `test-results/scenario-alerts-build.log` and `test-results/hrt-optimization/verification.json`.

## Production release

Deployment `dpl_EfQCNVs4e8gTKRLV3YD1vn1maueA` is ready and aliased to the same permanent address. Release metadata: `scenario-input-alerts-20261108`. Previous deployment: `dpl_5uENg1KiPKirz5PB9bv11HC5w8XA`.

Live browser verification passed for the notification flow, refresh persistence, acknowledgement, correction, unavailable-check handling, mobile layouts, automatic checks in both optimization flows and AI & KPI reports. Both model metadata responses exactly match the pre-release capture. Five historical audit records retain valid integrity and pass replay.

Live Task 1 verification run: `65cb6b94-626b-4b45-8067-910ff671a5e7`.

Live Task 2 verification run: `b3ed13b1-efbc-4697-a8c8-64f643783d3d`.

Production evidence: `test-results/scenario-alerts/before.json`, `after.json`, and `live/verification.json`. The comparison was checked on 8 November 2026 at 16:17 UTC.
