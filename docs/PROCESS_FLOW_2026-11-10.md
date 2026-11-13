# Animated process flow — 10 November 2026

Historical release record. The browser model-link summary described below is superseded by [Monitoring separation](MONITORING_SEPARATION_2026-11-10.md). The diagram now shows monitoring evidence only; optimization has its own execution and records.

The client reference `AQUAIVOLT_Integrated_SCADA_Process_Digital_Twin 2 28 111026.html` is represented by a native SVG process diagram in Gas monitoring (Readings and Auditor tests) and Alerts (Alarm history). It uses the current application colours.

## Data and execution

The process runs visually from wastewater holding tank through feed pump/valve, anaerobic digester, gas cleaning, gas holder and CHP generator, with a treated-water branch. Its readouts use the current saved monitoring snapshot: COD inlet/outlet, feed, pH, temperature, COD removal, methane, H2S, oxygen, pressure, biogas flow, power and voltage. Source row, fixture and timestamp remain visible. HRT is the existing 90 m3 engineering estimate; daily energy is the current kW multiplied by 24.

Start, Pause and Reset control only SVG motion. They neither submit equipment commands nor alter readings, thresholds or audit records. Replay and sample controls remain separate and persist their commands. Critical, missing, stale or unavailable monitoring pauses motion. Recovery requires an explicit restart. Reduced-motion preferences suppress the motion, and the diagram scrolls within its panel on small screens.

The existing monitoring assessment supplies all colours and alarm labels. The supplied HTML's separate demonstration optimizer was not introduced as a new production model. Model weights, inputs, prediction routes and server audit semantics are unchanged.

The browser observes successful monitored model responses from the same-tank and reactor studies. Its summary identifies the model run and exact snapshot, with a link to saved evidence when recording succeeded. After the snapshot changes, the prior model is labelled as belonging to an earlier snapshot. The summary lasts for the browser session; the underlying model/link records are persistent server evidence.

## Verification and release

- Production build passed; 129 automated tests passed.
- Browser checks cover source-value mapping, normal/warning/critical states, start/pause/reset without snapshot mutation, missing/stale data, recovery, reduced motion, exact model linking, earlier-snapshot labelling, saved-report retrieval and mobile overflow.
- Deployment: `dpl_7CemTMuDUmT7rSnteHLBqL7uRwGh`.
- Application: https://aquaivolt-command-center.vercel.app/.
- Current browser evidence: `evidence/PROCESS-FLOW-LIVE.json` in the updated client delivery. The original 34-check monitoring API evidence is retained separately as `evidence/LIVE-ACCEPTANCE.json`.

The updated client package contains an 18-slide presentation, 11-page Word/PDF guide, source, screenshots, demo CSV, prior API evidence and updated browser evidence. Video remains deferred. The schematic is an equipment-disconnected demonstration, not a commissioned SCADA control or validated plant digital twin.
