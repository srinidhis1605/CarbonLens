# Module 2 — Data Integrity Results (What-if Optimization Simulator)

**Scope:** `backend/services/simulationService.js`, `backend/routes/v2Simulations.js`, `frontend/src/pages/SimulatorPage.js`  
**Verification Run:** `node backend/tests/test_module2_data_integrity.js` + `verify_modules_1_2_3.js` + `test_module2_edge_cases.js` + `test_live_e2e_v1_v2.js`

---

## 1. Hardcoded / Fallback Issues Identified & Corrected

| Finding | File | Correction Applied |
|---|---|---|
| Hardcoded `DEFAULT_CONFIG` slider percentages in frontend component | `frontend/src/pages/SimulatorPage.js` | Removed `DEFAULT_CONFIG`; initial slider assumptions are built dynamically from `GET /api/v2/simulations/scenarios` (`SCENARIO_CATALOG`). |
| Empty/missing scan input `{}` silently converted to `0` baseline | `backend/services/simulationService.js` (`extractBaselineFromAnalysisRow`) | Added explicit `hasExplicitTelemetry` guard; throws `MISSING_SCAN_TELEMETRY` on `{}` or `null` while allowing genuine measured `0`-byte scans. |
| Clicking `View` on a saved simulation left stale `comparisonSuite` chart from a previous scan/run | `frontend/src/pages/SimulatorPage.js` | Cleared `comparisonSuite`, updated `selectedAnalysisId`/`simulationName`/`simulateGreenHosting` from the loaded saved simulation, and tagged header `Loaded Saved Simulation #id`. |
| `toKb` and table cells used `|| 0` / `?? 0`, masking missing fields as `0` | `frontend/src/pages/SimulatorPage.js` | Replaced with explicit null checks (`Unavailable` / `—`) while rendering genuine `0` accurately. |
| Provenance distinction between Baseline (`MEASURED`/`CALCULATED`) and Output (`SIMULATED`) needed explicit structure | `simulationService.js` + `SimulatorPage.js` | Added `provenance` block to response and labeled every simulated card & chart `SIMULATED` plus added simulated Requests/3P card. |

---

## 2. Actual Data Source & Formulas

- **Baseline Source (`MEASURED` + `CALCULATED`)**: Loaded from MySQL `analysis` + `websites` + `analysis_payload` via `getRawAnalysisRow(userId, baselineAnalysisId)`.
- **Category Compounding (Anti-Double-Counting)**:
  $$\text{effectiveReduction} = \min\left(\text{maxCap},\ 1 - \prod_i (1 - r_i)\right)$$
  applied separately per category (`images` max `90%`, `scripts` max `85%`, `styles` max `85%`); Scenario D request-loading optimization applies solely to `otherBytes` so bytes saved by A/B/C are never subtracted twice.
- **Reconciliation Invariant**: `simulated.totalBytes === imageBytes + scriptBytes + styleBytes + fontBytes + otherBytes` (`reconciliationVerified: true`).
- **Energy & Carbon (`CALCULATED` from `SIMULATED` bytes)**:
  - `energyUsedKWh = (totalBytes / 1024^3) * 0.06` (invariant under green-hosting-only changes)
  - `carbonIntensity = simulateGreenHosting ? 312 : 442` gCO₂/kWh
  - `co2EstimateGrams = energyUsedKWh * carbonIntensity`
  - `carbonScore = round(100 * exp(-0.15 * pageWeightMB))`

---

## 3. Executed Edge-Case Test Results (`test_module2_data_integrity.js`)

| Test | Input / Condition | Observed Output | Status |
|---|---|---|---|
| `M2-DI.1` Missing scan telemetry | `{}` and `null` | Throws `MISSING_SCAN_TELEMETRY` | **PASS** |
| `M2-DI.2` Zero-byte scan | Live MySQL `#9` (`sathyabama.com`, `0` bytes) | `totalBytes=0`, `bytesSaved=0`, `pageWeightReductionPct=0`, `reconciliationVerified=true` | **PASS** |
| `M2-DI.3` Missing asset category | Live MySQL `#8` (`erp.sathyabama.ac.in`, `image_bytes=0`) with Image scenario | `imageBytesSaved=0`, `imageReductionPct=0`, `reconciliationVerified=true` | **PASS** |
| `M2-DI.4` 100% & max boundaries | `100%`, `101%`, `-1%`, `'abc'` vs max allowed sliders | Invalid/100% rejected; max sliders cap at `90%` (`capApplied=true`) | **PASS** |
| `M2-DI.5` Green-hosting-only | Live MySQL `#10` (`sathyabama.ac.in`) with `simulateGreenHosting=true` | `energyUsedKWh` invariant (`0.00067997`), intensity `442->312`, CO₂ `0.3005->0.2121 g` (`-29.41%`) | **PASS** |
| `M2-DI.6` No scenario selected | `{}` scenarioConfig without green toggle | Rejected (`Enable at least one optimization scenario`) | **PASS** |
| `M2-DI.7` Baseline switch & repeatability | `#8` vs `#10`, plus repeated `#10` runs | Distinct baselines; repeated runs produce bit-identical `totalBytes` & `co2EstimateGramsPrecise` | **PASS** |
