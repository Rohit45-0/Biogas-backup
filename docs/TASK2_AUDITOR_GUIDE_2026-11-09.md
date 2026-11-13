# HRT Optimization model - Reactor Technologies: auditor steps

Use https://aquaivolt-command-center.vercel.app/ with an authorized admin account. Task 1 remains the existing production optimization workflow. Open **HRT in hours** for **HRT Optimization model - Reactor Technologies**; its audit workspace is also available under **Audit Trail → HRT Optimization model - Reactor Technologies**.

## Source BEFORE / AFTER check — updated 10 November 2026

The initial study mode is now **Source BEFORE → AFTER**, with **Source BEFORE / AFTER values** selected. This comparison reads the original columns, including their stored precision. It does not use an already-optimized AFTER scenario as the BEFORE reference.

1. Select H1 (UASB) and run HRT optimization. Expect BEFORE HRT **360 hours (15 days)** from the source BEFORE column. AFTER HRT is the lowest qualifying source HRT, **4.1 hours** with the default unconstrained source inputs. The percentage change is approximately **−98.86%**. Both HRT columns are already in hours; no conversion is applied to either stored value.
2. The table retains all 400 source records, filtering eligibility to the selected technology. Switch technology to check H2–H6 and C1–C3. Each pathway uses its actual AFTER values, not a forced 2–4-hour target. The BEFORE values must agree with all source records in that technology; differing BEFORE records fail validation instead of being silently replaced.
3. Compare source record **T2-B-0169**, Excel row 170 of the high-rate file: HRT **360 → 7.6 h**, biogas **66.15 → 98.20 m³/day**, methane **42.09 → 61.16 m³/day**, electricity **151.07 → 219.53 kWh/day**. HRT decreases **352.4 h (97.8888889%)**. Source daily outputs preserve the original cell values; do not replace them with independently recalculated products of rounded gas and composition cells. Year projections in the application remain daily outputs × 365.
4. Inspect the Biogas, Methane and Electricity HRT graph tabs. The axes include the full BEFORE reference and the selected AFTER point. The green dashed arrow connects these endpoints; it is not a fitted response between 360 hours and the candidate range. Source file, sheet and row are displayed and retained with the saved evidence and CSV exports.
5. Export the KPI report and scenarios. Confirm the same BEFORE/AFTER values and source-reference fields. Open the saved run in Audit Trail and verify: expected **PASS**, including original BEFORE provenance and exact AFTER-column checks.
6. Change only Calculation method to **AI model · 2,000 generated scenarios**. Expect the same source BEFORE reference with 2,000 newly generated inputs in the selected technology. AFTER production now comes from model inference, so it need not equal an individual Excel row. Verify this mode separately using its saved seed and source-parent lineage.

The conventional CSTR BEFORE reference and a high-rate AFTER pathway can represent equipment or pretreatment changes. These source comparisons are not evidence of an AI-only intervention in the same reactor. **Optimize the same reactor** remains available for that separate question and keeps its explicitly selected starting scenario. Historical saved records are preserved with their original baseline and version; they are not rewritten to 360 hours. An earlier engine's record can retain valid server integrity while current-engine replay reports a version mismatch.

The production Biogas, Methane and Electricity pages retain their original output calculations. They open on the daily comparison. Their optional HRT analysis identifies a shared input HRT rather than presenting identical times as an HRT optimization. Original source BEFORE / AFTER retention time is assessed in the separate HRT model.

## Training records and generated candidates

Two supplied workbooks contribute 200 records each, preserved as 400 training records. IDs T2-A-0001 to T2-A-0200 identify the file including CSTR; T2-B-0001 to T2-B-0200 identify the high-rate file. Original filenames, sheet names, Excel rows and SHA-256 remain available. The merged Excel contains these 400 records, not the subsequently generated model evaluations.

**AI model · 2,000 generated scenarios** creates 2,000 distinct new operating-input vectors on each run. In same-reactor mode, all 2,000 belong to the selected reactor configuration. In technology-upgrade mode, the 2,000 are distributed across nine technologies (222 or 223 each). Every input interpolates two neighbouring source inputs within the same configuration, using one shared interpolation weight for all features. Exact source inputs and duplicate generated inputs are excluded. The existing fitted reactor-specific Ridge model predicts biogas and methane content at each new vector; methane volume and gross electricity are then calculated. Source output values are not copied as predictions, and no random percentage gains are applied.

A fresh generation seed creates a new pool on every optimization click. The saved seed reproduces the complete pool, predictions and selection. The explicitly selected baseline stays fixed when rerunning with unchanged settings. A new pool does not guarantee a larger gain or a different rounded result.

**Source BEFORE / AFTER values** evaluates the 400 supplied records without generated predictions. In the default Source BEFORE → AFTER study it preserves the exact source output columns. Task 1 still evaluates its existing 2,000-input pool using its own fitted production model.

## Baseline and meaning

The **Reactor 2 technologies in comparison** selector chooses the starting reference. In **Optimize the same reactor**, select a starting scenario in the chosen technology. Its default is the first source record, independent of output. Both baseline and generated candidates use the same reactor-specific fitted model. A manually entered baseline remains fixed; blank outputs remain unavailable.

The original BEFORE columns contain a shared 360-hour conventional-CSTR reference. The new Source BEFORE → AFTER mode reads this reference from the original rows. The separate technology-upgrade comparison also retains the conventional reference. These are not measured UASB or other same-reactor baselines. Technology upgrades can change equipment or pretreatment; their differences cannot be attributed to AI-only operating changes.

## Repeatable checks

1. Download **400 training scenarios**. Confirm H1: 57, H2: 57, H3–H6: 55 each, C1–C3: 22 each. All eight original sheets are archived in the project evidence.
2. Select **Optimize the same reactor**, **AI model · 2,000 generated scenarios**, H1 (UASB), starting scenario **T2-A-0001**, unspecified feed and blank constraints. Click **Run HRT optimization**.
3. Confirm **2,000 evaluated**, **2,000 generated**, and **400 training records**. Baseline HRT remains **10.2 h**. Selected IDs start with GEN-H1-; eligible candidates must reduce HRT and increase each supplied production output in the same reactor configuration. No exact selected ID or qualifying count is prescribed because the seed changes.
4. Check daily percentage change = (after − before) / before × 100; methane = biogas × methane percentage / 100; gross electricity = methane × 9.97 kWh/m³ × 0.36. Annual production is daily production × 365. HRT change = after HRT − before HRT; percentage HRT change = (after HRT − before HRT) / before HRT × 100. Negative means decrease, positive means increase, and zero means unchanged. Missing/zero baselines do not produce invented percentages. Historical export fields retain their original names for compatibility.
5. Switch **Day / Year**. Verify totals scale while percentage changes stay fixed; HRT remains in hours. Use **Export KPI report** beside the generated report to check the seven exact metric rows.
6. Include excluded scenarios. The table shows 50 candidates per page. Use **Next candidates** and verify the count reaches 2,000. **Export 2,000 scenarios** exports the complete run, regardless of page/filter. It includes inputs, outputs, before/after values, gains, eligibility, parent IDs, both parent files/sheets/rows/hashes, interpolation weight, seed and model/data identities.
7. Rerun unchanged settings: baseline and model identities must stay fixed; seed and pool hash must change. Verify each saved run independently. Explicitly replaying a saved seed must reproduce its original candidate pool and output hash.
8. Set Maximum HRT to **4 h** for H1 and rerun. Expect **No qualifying scenario**, the same baseline, no invented after value, and a saved auditable run. Clear the limit.
9. Repeat same-reactor runs for H2 EGSB, H3 AnMBR, H4 TPAD, H5 thermochemical pretreatment, H6 thermal pretreatment, C1 thermophilic CSTR, C2 pretreated CSTR and C3 hybrid CSTR. Each evaluates 2,000 new inputs in that configuration. No qualifying result is a valid outcome when the model cannot meet the constraints.
10. Test **Compare technology upgrades** with the AI model method: expect 2,000 generated inputs across all nine pathways and the selected conventional-CSTR reference. Test **Source scenario values** separately: expect 400 supplied records and zero generated candidates.
11. Click **Verify saved run**, then **Open in Audit Trail**. Confirm kind reactor_search, run ID, seed, fixed baseline, generation/model/filter/selection trace, model/data/engine hashes and output hash. Download audit JSON, all candidate evaluations and KPI report. Retrieve after reload and verify again; expect **PASS** with all checks passing.
12. Historical Task 1 records, original 200-row hrt_optimization records, and 400-row reactor_optimization records remain available using their original calculation versions. For example, the older 400-row default H1 engine selected T2-B-0133; this is historical evidence, not a prescribed selection for generated runs.
13. Alerts remain a separate source-input coverage feature. All 400 records contribute to their pathway ranges. These are not plant safety limits; CSTR loading-unit coverage is unavailable while COD/VS is unresolved.

## Model limitations and integrity

The HRT comparison graph is available on the main reactor page, the corresponding Audit Trail model tab, and saved reactor evidence. Switch between Biogas, Methane and Electricity. The grey marker and dashed line show the saved baseline; the green marker shows the selected candidate. Blue points show all evaluated inputs in the selected reactor configuration. The blue trend connects arithmetic means in up to twelve equal-width HRT bands. This is a descriptive summary of multi-input predictions, not an HRT-only fitted response curve. The displayed values, run ID and candidate count must agree with the saved record and CSV. A run without a qualifying selection has no green point or substituted after value. Upgrade comparisons show the selected technology's candidate cloud and identify the different baseline technology.

Training used reactor-specific operating features without target/ID leakage. Validation groups matching original scenario numbers across files to keep related records together. Hyperparameters were selected within training data, followed by fitting the full source dataset.

Biogas did **not** pass the held-out performance gate: grouped random holdout R² is approximately **−0.143**, and ordered holdout R² approximately **−75.57**. The new generator is explicitly exploratory within source-input ranges. It does not change fitted model weights, add measured training observations or improve these validation scores. Staying within source ranges does not establish plant suitability or a causal production response. A successful software replay is not proof of plant accuracy or realized benefit.

Gross electricity excludes heating, pumping, pretreatment and membrane loads. Feed compatibility needs review. CSTR organic loading is excluded from model features while the original COD/VS unit conflict remains unresolved.

Exports use SHA-256 and server-side HMAC integrity checks. These are server-authenticated exports, not independent public-key verification. A failed save or failed integrity/replay check must be reported as a failure; HTTP 200 alone is not a validation result.

