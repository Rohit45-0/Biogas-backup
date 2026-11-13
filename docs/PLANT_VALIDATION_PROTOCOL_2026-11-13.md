# Proposed post-commissioning validation protocol

Status: proposed for Doris, plant engineer and auditor approval. No plant acceptance is claimed. Target dates below start from commissioning and access to usable measured data, not from shipment.

## Preparation and responsibilities

Before acquisition, the plant engineer approves sensor calibration, units, ranges, sampling intervals and independent protective systems. The developer freezes model files, hashes, code revision and input/output contracts. The auditor signs the evaluation plan, exclusions, operating-condition matching rules and acceptance gates BEFORE the final dataset is opened.

The EPA AgSTAR guide describes routine instrument calibration, recorded monitoring and laboratory sampling; pH alone can lag developing instability. This supports timestamped laboratory and sensor measurements, not a universal plant alarm setting. [EPA operator guidebook](https://www.epa.gov/agstar/anaerobic-digesterbiogas-system-operator-guidebook).

## Data collection

- Record plant/reactor ID, feedstock composition, feed flow and COD/VS loading, reactor volume, HRT/SRT, temperature, pH, gas flow with declared reference conditions, methane fraction, H₂S, pressure, generator load, gross and net electrical energy, auxiliary energy, maintenance and equipment changes.
- Each value retains instrument/laboratory ID, unit, calibration reference, sample time, result-available time and quality flag. VFA, alkalinity, TAN and COD enter a prediction only when the laboratory result was actually available and within an approved maximum age. Never manufacture hourly laboratory observations.
- Preserve raw data. Record missingness, sensor outages, rejected measurements and corrections separately. Track operating periods affected by startup, washout, maintenance, feed changes or hardware changes.
- Training, tuning and final evaluation use disjoint complete events/operating periods, and independent sites when available. Use a gap at least as long as the lookback and outcome horizon, extended for process residence/carryover as agreed by the engineer.

Time-correlated rows and preprocessing can leak evaluation information. Fit preprocessing only on training partitions and keep temporal/group separation. [scikit-learn cross-validation](https://scikit-learn.org/stable/modules/cross_validation.html), [data leakage guidance](https://scikit-learn.org/stable/common_pitfalls.html).

## Prediction accuracy — proposed decision gates

Freeze one model version for each evaluation. Report every target's MAE, RMSE, bias, R², sample count and confidence intervals using independent periods as the resampling unit. Compare against both persistence and a training-mean baseline; never tune on the final test.

Proposed acceptance: all predeclared outputs improve MAE over the strongest simple baseline, and the 95% interval for that improvement excludes zero. Each output must also meet the plant engineer's predeclared maximum error in physical units. Those numerical tolerances depend on instrument accuracy and the operating decision and must be agreed before data collection; no tolerance is presently approved.

Coverage must include every feedstock/operating region for which a claim is sought. Insufficient coverage, excessive missingness or too few independent periods results in INCONCLUSIVE, not PASS. Sample size is determined prospectively from pilot variability, the agreed error margins and effective independent periods, not hourly row count.

## Measured optimization benefit

Compare baseline and recommendation periods under matched feedstock, COD/VS loading, reactor configuration, ambient conditions and generator loading. Where feasible and safe, use engineer-approved randomized/crossover operating blocks with stabilization/washout periods. Freeze the matching and exclusion rules before testing.

Primary outcomes: methane yield per kg COD/VS fed and net electrical energy per kg feed/loading unit. Also report absolute gas, methane and net energy totals, COD removal, HRT/SRT, auxiliary consumption and stability. Document pretreatment and retrofit energy; hardware changes must not be attributed solely to AI.

Benefit = (matched optimized outcome - matched baseline outcome) / matched baseline outcome ×100. Report uncertainty and individual blocks, including failures. Proposed benefit gate: the 95% confidence interval for the paired net benefit is above zero and above the minimum commercially meaningful effect agreed in advance, with no deterioration in approved process-quality constraints. No fixed 50% improvement is promised.

HRT change is signed: selected HRT minus baseline HRT, with units and direction. Reduced HRT is only acceptable if treatment and stability outcomes remain within commissioned criteria.

## Early warning — improvement and acceptance

Keep fixed warning/critical alarms, predictive advisories and high-risk operator-review policy independent. AI remains advisory. Do not create dangerous failures for evaluation; use historical events, safe supervised tests and approved replay data.

Current six-event workbook is an already inspected regression benchmark. The original score found only two events under its historical 12-hour comparator, with no demonstrated lead over the first fixed thresholds in the auditor replay. A separate persistent-trend candidate is provided for comparison; it is not a trained failure classifier.

For a trained successor, use measured sensor histories and timestamp-available laboratory values. Freeze fault-event definitions, alert deduplication, the 12-hour horizon and event/site holdouts before training. Tune only on development events. A final test must contain new, untouched complete events.

Report event recall by failure family, missed events, false advisory episodes per 30 normal operating days, time under advisory, lead to independently adjudicated event onset, and lead versus the FIRST fixed warning or critical alarm. Retain zero/negative lead times. Distinguish event-level confidence intervals from hourly classification scores.

Proposed advisory release targets for discussion: event recall ≥80%, positive median lead over first fixed alarm, at least 2 hours median lead to adjudicated onset, and ≤1 false advisory episode per 30 normal operating days. These are proposed usability/performance targets, not safety guarantees or approved plant thresholds. A statistically adequate independent event/site sample and per-fault review are required; six injected events cannot establish acceptance.

## Schedule and evidence

Before commissioning: freeze this protocol, artifact package, account security tests and historical integrity report. Within 5 working days of commissioning: confirm calibration, time synchronization, acquisition and laboratory timing. Within 10 working days: review data quality and pilot variability, then agree final study duration and sample size. Issue the first validation report within 5 working days after the agreed independent dataset is complete. Calendar dates require the equipment/commissioning date.

Deliver raw-data checksums, provenance, split manifest, frozen artifacts, analysis script, all results, exclusions, failed cases and signed reviewer decisions. The software provides server-authenticated records; HMAC is not independent public-key verification. Independent engineered protection remains responsible for gas leaks, overpressure, exposure and electrical protection.
