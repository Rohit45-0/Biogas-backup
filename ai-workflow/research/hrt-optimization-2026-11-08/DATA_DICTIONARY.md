# Task 2 data dictionary

Original files and all eight sheets are retained in sources/ and source-archive.json. Source rows are planning simulations, not measurements. task2.xlsx is reference only, not additional training data.

| Normalized field | Workbook column / unit | Treatment |
| --- | --- | --- |
| id, sourceScenario | A | Identifier only; excluded from prediction |
| pathway, technology, configuration | B–D | Technology context |
| baseline | E–J | Fixed conventional CSTR reference |
| hrtHours | K / hours | Candidate decision input |
| srtDays | M / days | Kept separate from HRT |
| temperatureC, ph, upflowMHour | N–P | Operating inputs |
| olr, olrBasis | Q | COD for H pathways; C pathway COD/VS conflict unresolved |
| outputs.methanePct | R / % | Outcome, never a predictor |
| outputs.biogasM3Day | S / m³/day | Stored source outcome |
| outputs.methaneM3Day | S × R / 100 | Reconciled derived outcome |
| outputs.electricityKwhDay | methane × 9.97 × 0.36 | Gross electricity, excludes parasitic loads |
| outputs.annualElectricityKwh | daily electricity × 365 | Constant-output projection |
| h2sInPpm, h2sOutPpm, stabilityPct | AB–AD | Source simulation values, not safety limits |
| provenance | Workbook, sheet, row, AE URL | Traceability; URL claims not independently verified |

Stored T–AA values remain in source-archive.json and their discrepancies are reported in reconciliation.json. They are not features. All model inputs exclude scenario ID and prescribed gain fields. The BEFORE columns are constant and cannot train a dynamic untreated baseline. Individual operating ranges are not validated safety limits.
