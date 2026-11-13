# Demo gas monitoring release — 10 November 2026

Historical release record. Automatic dashboard model linking and the old UI names below are superseded by [Monitoring separation](MONITORING_SEPARATION_2026-11-10.md). Dashboard planning is now independent; the explicit monitored API and historical evidence remain available.

The Gas monitoring and Lebanon map navigation entries use the supplied 58-row v77 demo dataset. The Alerts entry opens the alarm lifecycle, with the earlier source-coverage checks retained separately.

## Implemented

- Thirteen explicit process rules for gas flow, methane, COD removal, pH, temperature, H2S, oxygen, pressure, power and voltage. Inclusive critical/warning comparisons; invalid thresholds rejected.
- Original source row/time preserved separately from replay time. Named fixtures cover warning, five critical conditions, missing and stale data. No live equipment source is implied.
- Browser-driven replay, one sample per six seconds. More than 60 seconds without a sample is stale. Server model guard also checks age; browser suspension does not create a false fresh state.
- Immutable monitoring snapshots with parent/session IDs, settings hash, actor and acknowledge/escalation/recovery history. All commands are confirmed through the existing private audit store; storage failure is explicit.
- Nine monitoring verification checks and downloads for source data, replay history, alarms and server-authenticated JSON.
- Monitored production entry point links the exact snapshot to the existing model result. Critical/unknown snapshots return HTTP 409. The original research calculation routes and model identities are preserved for historical replay.
- Server-backed report index/direct-ID restoration, with cursor pagination and explicit partial-list state. Monthly reports now include baseline methane and electricity beside AI values.

## Routes

`/api/monitoring`: metadata, saved records, commands, exports and verification.

`/api/monitoring/production?model=hrt|reactor-search`: authenticated admin production with `x-aqua-demo-snapshot` header, server guard and a separate saved model-context link.

`/api/research/history`: paginated research report summaries. Existing model record and CSV endpoints remain authoritative.

## Verification

`pnpm run build`, `node --test tests/*.test.mjs` (129 passed), and `node scripts/verify-monitoring-ui.mjs` passed. Browser coverage includes lifecycle, map selection, recorded model link, report recovery after logout and 390px mobile overflow checks. Client evidence and production IDs are in the dated delivery package, separate from local test stores.

The map assigns the demo feed only to Ain Saade. Other named sites have no assigned feed. Engineering baseline calculations are labelled separately from the trained production model; HRT is calculated from the supplied feed/volume assumptions without an artificial reduction.

## Boundaries

Demo thresholds are not approved plant limits or ambient exposure limits. No real analyzer connection, unattended monitoring service, equipment actuation, safety interlock, SMS/email escalation or plant accuracy claim is introduced. The monitored production route is an advisory workflow, while independent research endpoints remain available for planning studies. Sessions are limited to 500 commands and can branch across concurrent browsers. Historic evidence is immutable.

Video is deferred. The client package includes the editable presentation, Word/PDF guide, source snapshot, original CSV, screenshots, test evidence and draft emails.

## Production acceptance

Deployment `dpl_B1ta3mpCZaqQDka3KvBxNfCDUsLV` is available at https://aquaivolt-command-center.vercel.app/.
All 34 production acceptance checks passed on 10 November 2026, including server persistence, critical-condition rejection, alarm recovery, nine monitoring verification checks, model execution and deterministic verification, exports, fresh-login retrieval, visible index membership and replay of an earlier model run.

| Evidence | Saved ID |
| --- | --- |
| Monitoring snapshot | `cbdbdb1b-4f4e-4573-8247-f0f1d63524bb` |
| Critical snapshot | `d08008d1-438e-492d-bba4-0dbe1294f85e` |
| Monitoring verification | `ea2aab95-d81b-46ad-92d5-01990e9a49ed` |
| Production model run | `2d014644-1231-45c6-872d-683dd478afed` |
| Model/monitoring link | `a60fd1df-501d-49c0-aa12-108f4fab1bec` |

Model version: `same-tank-ridge-500-2026-11-10-v1`. Artifact hash: `sha256:2376a11b674926cf5537d47a85ba25695dfccdb5e9dfeaf45a2811fb6180d7f1`.
These are software acceptance results, not external audit approval or measured plant validation.
