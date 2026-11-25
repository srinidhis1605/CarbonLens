# CarbonLens 2.0 — Modules 1–3 Accuracy, Stability & Consistency Audit

**Audit Date:** 2026-11-25  
**Scope:** Modules 1, 2, and 3 + Cross-Module Consistency + V1 Regression (Module 4, CatBoost, and PDF reporting intentionally held pending user approval).

---

## Executive Summary

All identified accuracy, stability, and consistency defects across Modules 1–3 were investigated against live MySQL records, live Gemini 2.5 Flash API responses, live Windows filesystem behavior, and live React/Playwright browser execution, then corrected and verified in a clean post-edit test run:

- **`verify_modules_1_2_3.js`**: `15 passed, 0 failed`
- **`verify_routes_http.js`**: `5/5` HTTP route & auth checks passed
- **`test_module1_live.js`**: Passed (Live Gemini 2.5 Flash on MySQL `#10` `sathyabama.ac.in`: `9,274 ms`, `generationMode: "gemini"`, `2,492` total tokens; zero-byte `#9` handled safely)
- **`test_module2_edge_cases.js`**: Passed (M1 <-> M2 byte/energy/CO₂/score parity on `#10`, green-hosting-only energy invariance, zero-byte `#9` edge case, combined suite)
- **`test_module3_verification.js`**: Passed (2 consecutive optimization runs under active HTTP polling with `0` `EPERM` errors, `99.07%` live filesystem reduction, `original/` unchanged, all 7 WebP dimensions >= display width, CSS layout & JS interactivity verified in Chromium)
- **`test_live_e2e_v1_v2.js`**: Passed (`E2E.1`–`E2E.7` covering real MySQL register/login, V1 scan & history & SEO audit, Module 1 live Gemini `8,957 ms`, Module 2 persisted simulation, Module 3 live HTTP optimization, and live React UI at `http://localhost:3000` in Chromium with `0` errors)
- **`frontend` `npm run build`**: `Compiled successfully` (`204.58 kB` gzipped JS, `4.84 kB` CSS)

---

## Issue-by-Issue Audit Record

### Issue 1 — Module 1: Gemini 20-Second Timeout & Non-Aborted Requests
- **Relevant Source File(s):** `backend/services/sustainabilityAgentService.js`
- **Root Cause:**
  1. Live minimal ping verified Gemini API key & endpoint were reachable in `1,121 ms`, but `runSustainabilityAgent` used `DEFAULT_AI_TIMEOUT_MS = 20000` with `Promise.race` without passing an `AbortController` signal or SDK timeout.
  2. `gemini-2.5-flash` ran with default reasoning/thinking budget and verbose multi-paragraph schema instructions without `reasoning_effort` or `response_format: { type: "json_object" }`, causing full scan prompts (such as `#10` `sathyabama.ac.in`) to exceed `20,000 ms` and fall back to `deterministic_fallback`.
- **Correction Made:**
  1. Verified Google Gemini OpenAI-compatibility layer support for `reasoning_effort` and `response_format: { type: "json_object" }`.
  2. Updated `callWithTimeout` to pass an `AbortController` `signal` and `{ timeout: timeoutMs }` into `client.chat.completions.create`, raised `DEFAULT_AI_TIMEOUT_MS` to `35000`, applied `reasoning_effort: "low"` for `gemini-2.5-*`, applied `response_format: { type: "json_object" }`, and tightened prompt verbosity.
- **Test Performed:** `node backend/tests/test_module1_live.js` and `E2E.4` in `backend/tests/test_live_e2e_v1_v2.js` against live Aiven MySQL and live Gemini 2.5 Flash.
- **Actual Test Result:**
  - `test_module1_live.js`: Live Gemini succeeded in `9,274 ms` (`generationMode: "gemini"`, `modelName: "gemini-2.5-flash"`, `fallbackReason: null`, `usage: {"completion_tokens":939,"prompt_tokens":713,"total_tokens":2492}`, 4 recommendations).
  - `test_live_e2e_v1_v2.js`: Live Gemini succeeded in `8,957 ms` (`reportId=3`, persisted & restored from MySQL).

### Issue 2 — Module 1: Cached Deterministic Fallback Blocked Fresh Gemini Attempts
- **Relevant Source File(s):** `backend/routes/v2Agent.js`, `frontend/src/pages/AiAgentPage.js`
- **Root Cause:** `POST /api/v2/agent/analyze` returned any cached row from `getLatestAgentReportForAnalysis()` when `forceRefresh` was `false`, even when the cached row was an earlier `deterministic_fallback` report from a timeout. Switching scans in `AiAgentPage.js` also failed to clear or scope cached selections cleanly.
- **Correction Made:**
  - Updated `v2Agent.js` so cached reports are served automatically only when `cached.generationMode === 'gemini'` (or when `AI_API_KEY` is unconfigured). Earlier `deterministic_fallback` rows no longer block a fresh Gemini attempt when `AI_API_KEY` is present.
  - Updated `AiAgentPage.js` to clear `activeReport` / `error` on scan change unless a Gemini-generated report is already saved for that scan.
- **Test Performed:** Verified via `test_live_e2e_v1_v2.js` (`E2E.4` + `E2E.7`) and code path verification in `verify_routes_http.js`.
- **Actual Test Result:** Fresh Gemini analysis executes and persists cleanly; fallback reports remain clearly labeled `"Deterministic Fallback Engine"` and never masquerade as Gemini outputs.

### Issue 3 — Module 1: Unsupported Energy/Hardware Claims & Unseparated Evidence Fields
- **Relevant Source File(s):** `backend/services/sustainabilityAgentService.js`, `frontend/src/pages/AiAgentPage.js`
- **Root Cause:**
  1. Fallback text previously referenced *"client-side CPU parsing/execution energy overhead"* and *"keep client and server hardware active longer"* without physical CPU or server power telemetry.
  2. Recommendations lacked explicit separation between measured facts, engineering inferences, and general suggestions.
  3. Zero-byte scans (e.g. live MySQL record `#9` `sathyabama.com`) triggered generic *"Lightweight page — preserve carbon budget"* advice instead of flagging the empty capture.
- **Correction Made:**
  - Separated schema fields into `measuredFacts`, `engineeringInference`, and `generalSuggestion` (preserving `evidenceFromScan`/`whyItMatters`/`recommendedSolution` aliases), deduplicated recommendations by category+issue, removed unsupported CPU/hardware energy claims, added explicit zero-byte scan diagnostic (`totalBytes === 0`), and updated `AiAgentPage.js` to render dedicated **Measured Facts (From Scan)**, **Engineering Inference**, and **General Suggestion** cards.
- **Test Performed:** `verify_modules_1_2_3.js` (`M1.1`–`M1.7`) and `test_module1_live.js` (zero-byte + fallback wording assertions).
- **Actual Test Result:** All assertions passed; `sathyabama.com` (`0` bytes) returned deterministic diagnostic warning without invoking Gemini, and all fallback/Gemini outputs strictly separated measured facts from engineering inferences.

### Issue 4 — Module 2: Green-Hosting-Only Scenario Rejected & Suite Ignored Green Flag
- **Relevant Source File(s):** `backend/services/simulationService.js`, `backend/routes/v2Simulations.js`
- **Root Cause:** `runWhatIfSimulation` threw `At least one optimization scenario must be enabled` when Scenarios A–D were disabled even if the user toggled `simulateGreenHosting`. Additionally, `runScenarioComparisonSuite` did not forward `options.simulateGreenHosting` into individual/combined comparison runs, and `pageWeightSavedMB` subtracted pre-rounded MB values instead of computing directly from `totalBytesSaved`.
- **Correction Made:**
  - Permitted green-hosting-only simulations when `simGreenHost !== baseline.isGreenHost`, passed `simulateGreenHosting` through `runScenarioComparisonSuite` and `v2Simulations.js`, and computed `pageWeightSavedMB` directly from `totalBytesSaved / (1024 * 1024)`.
- **Test Performed:** `test_module2_edge_cases.js` against live MySQL record `#10` (`sathyabama.ac.in`) and `#9` (`sathyabama.com`), plus `verify_modules_1_2_3.js` (`M2.1`–`M2.5`).
- **Actual Test Result:** Green-hosting-only run kept `energyUsedKWh` invariant at `0.00067997 kWh` (`0%` energy change) while changing `carbonIntensity` `442 -> 312` and reducing CO₂ `0.3005 -> 0.2121 g` (`-29.41%`). Zero-byte `#9` ran cleanly with `reconciliationVerified: true` and zero `NaN`/`Infinity`/negative outputs.

### Issue 5 — Module 2 Frontend: Stale Simulation Results & Unit Precision Mismatches
- **Relevant Source File(s):** `frontend/src/pages/SimulatorPage.js`
- **Root Cause:** Changing `selectedAnalysisId` left the prior website's `result` and `comparisonSuite` rendered on screen. CO₂ was displayed to 6 decimals in Module 2 vs. 4 decimals in Module 1/V1, and page weight lacked exact byte counts alongside MB.
- **Correction Made:** Cleared `result`, `comparisonSuite`, `error`, and `successMsg` on baseline selection change; standardized display precision to `toFixed(2) MB` + exact byte counts and `toFixed(4) g` CO₂ + explicit carbon intensity (`gCO₂/kWh`).
- **Test Performed:** `frontend` production build (`npm run build`) + live Chromium UI walkthrough in `test_live_e2e_v1_v2.js` (`E2E.7`).
- **Actual Test Result:** Compiled with 0 errors; live Playwright UI verified `Reconciliation Verified: YES` on `/simulator`.

### Issue 6 — Module 3: Windows `EPERM` Error in `cleanOptimizedDirectory()`
- **Relevant Source File(s):** `backend/services/optimizationService.js`
- **Root Cause:** `cleanOptimizedDirectory()` called `fs.rmSync(OPTIMIZED_DIR, { recursive: true, force: true })` to delete `research/test-website/optimized` itself while Express static servers (`server.js` on `:5000` / preview `:5055`), browsers, or Windows locks held handles on the directory, causing repeated `EPERM, Permission denied` errors in `task-202.log`. Additionally, `sharp` file caching was not disabled (`sharp.cache(false)`).
- **Correction Made:**
  1. Added `sharp.cache(false)` at module load to release image handles immediately.
  2. Replaced `rmSync(OPTIMIZED_DIR)` with isolated staging generation (`createStagingDirectory()` -> `.staging-<ts>-<pid>`), pre-publish asset & HTML reference verification (`verifyStagedSite()`, checking `index.html`, all `<img src>`, `<script src>`, `<link href>`, JS syntax via `new vm.Script`, and image metadata via `sharp`), and safe in-place synchronization (`syncStagingToOptimized()` with `withWindowsLockRetry` for `EPERM`/`EBUSY`/`EACCES`) that never deletes `OPTIMIZED_DIR` itself.
  3. Recalculated all post-run sizes directly from live filesystem `fs.statSync` via `summarizeDirectory()`.
- **Test Performed:** `test_module3_verification.js` (2 consecutive optimizations while concurrently polling `http://127.0.0.1:5000/controlled-site/optimized/` every `50ms` + Playwright visual/asset/JS/CSS inspection) and `test_live_e2e_v1_v2.js` (`E2E.6`).
- **Actual Test Result:** Both consecutive runs returned `status: "COMPLETED"`, `0` `EPERM` errors, `originalPreserved: true` (`18,253,675 B`, `14` files untouched), `optimizedTotalBytes: 169,670 B` (`99.07%` reduction), `stagingVerified: true` (`11` asset refs checked). Playwright confirmed `0` broken images, `0` console/page errors, all 7 WebP natural resolutions >= rendered display box (`96x96` >= `36x36`, `1200x675` >= `492x277`, `800x500` >= `362x190`/`556x240`), identical CSS theme/grid styles, and interactive JS filter + footprint estimator (`61.04 GB`).

### Issue 7 — Module 3: Silent Loss of Failed Runs & Stale Successful Run Display in Frontend
- **Relevant Source File(s):** `backend/routes/v2Optimization.js`, `frontend/src/pages/OptimizationPage.js`
- **Root Cause:** Fatal errors inside `runControlledOptimization` exited into a `catch` block returning HTTP 400 without persisting a `FAILED` record to `optimization_runs`. Simultaneously, `OptimizationPage.js` left the previous `COMPLETED` `activeRun` visible below the error banner.
- **Correction Made:**
  - Updated `v2Optimization.js` to persist `FAILED` and `PARTIAL_SUCCESS` runs to `optimization_runs` (returning the failed `run` object with HTTP `500` on failure).
  - Updated `OptimizationPage.js` to clear `activeRun` before starting a new execution (`setActiveRun(null)`), display failed `run` details when an error occurs instead of an old `COMPLETED` run, label initial loaded runs explicitly as `"Latest Saved Run from Database"`, and display `originalDimensions -> optimizedDimensions` + per-operation errors.
- **Test Performed:** `npm run build`, live `E2E.6` & `E2E.7`, plus live route inspection.
- **Actual Test Result:** Compiled cleanly and verified live in Chromium at `http://localhost:3000/optimization`.

### Issue 8 — Cross-Module Consistency: MySQL `FLOAT` 1-Byte Drift & Missing `totalBytes` in `AI_METRICS_INPUT`
- **Relevant Source File(s):** `backend/routes/analysis.js`, `backend/services/sustainabilityAgentService.js`, `backend/services/simulationService.js`
- **Root Cause:** `analysis.page_size` is stored as a MySQL `FLOAT` in MB, while `AI_METRICS_INPUT.rawScrapedData` omitted `totalBytes` and `otherBytes`. Restoring `totalBytes` from `Math.round(page_size * 1024 * 1024)` caused a 1-byte `FLOAT` rounding mismatch (`18,253,676` vs. actual `18,253,675` scanned bytes) on large pages, and a 4-byte `otherBytes` artifact on `#10`.
- **Correction Made:** Added `totalBytes` and `otherBytes` to `buildMetricsPayloadForAi` in `backend/routes/analysis.js` (additive, preserving all V1 keys) and read `analysis_payload.AI_METRICS_INPUT.rawScrapedData.totalBytes` in both `sustainabilityAgentService.js` and `simulationService.js` (with ±16-byte `FLOAT` rounding reconciliation fallback for older legacy rows).
- **Test Performed:** `test_module2_edge_cases.js` (record `#10`) and `test_live_e2e_v1_v2.js` (`E2E.2`, `E2E.4`, `E2E.5` on fresh scan `#12`).
- **Actual Test Result:** Exact byte parity verified (`scanRes.totalBytes === report.scanEvidence.totalBytes === sim.baseline.totalBytes`), matching energy (`0.00067997 kWh` on `#10`), CO₂ (`0.3005 g`), and score (`18/100`).

---

## Remaining Limitations & Scope Boundaries

1. **Legacy Scans Prior to This Audit (`id <= 10`)**: Older DB rows whose `analysis_payload` did not store `rawScrapedData.totalBytes` still reconstruct `totalBytes` from `page_size` (`FLOAT`) with a ±16-byte reconciliation guard when `otherBytes` is negligible. New scans store exact `totalBytes` and `otherBytes` in `analysis_payload`.
2. **Deferred Modules (Intentionally Held)**: Module 4 (Before-and-After Validation UI/execution), CatBoost model training/UI, and PDF Audit Reporting (`pdfkit`) remain unimplemented pending your approval.
