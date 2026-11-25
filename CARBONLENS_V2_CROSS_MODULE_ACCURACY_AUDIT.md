# CarbonLens 2.0 — Cross-Module Data Integrity & Accuracy Audit (Modules 1–3)

**Scope:** Consistency across CarbonLens V1 (`analysis` table / `normalizationService.js`), Module 1 (`AiAgentPage` / `sustainabilityAgentService`), Module 2 (`SimulatorPage` / `simulationService`), and Module 3 (`OptimizationPage` / `optimizationService` / controlled test website).

---

## 1. Documented Formulas & Cross-Module Consistency Check

| Check Area | Verification Outcome | Provenance & Implementation |
|---|---|---|
| **1. Units (`MB` vs `KB` vs `B`)** | **Verified Consistent** | `1 KB = 1024 B`, `1 MB = 1024 * 1024 B`, `1 GB = 1024^3 B` across `normalizationService.js`, `sustainabilityAgentService.js`, `simulationService.js`, `optimizationService.js`, and React UIs (`toFixed(2) MB` + exact bytes/KB). |
| **2. Energy Formula** | **Verified Consistent** | Single shared helper `calculateSustainabilityMetrics()` (`energyUsedKWh = totalWeightGB * 0.06`). Used identically by V1 scanner, Module 1 evidence, Module 2 baseline & simulated metrics, and Module 3 browser estimates. Treated strictly as `CALCULATED`. |
| **3. CO₂ Formula** | **Verified Consistent** | `co2 = energyUsedKWh * carbonIntensity`, formatted to 4 decimals (`co2EstimateGrams`) consistently in V1 DB, Module 1 UI, Module 2 UI, and Module 3 UI. |
| **4. Sustainability Score** | **Verified Consistent** | `carbonScore = round(100 * exp(-0.15 * pageWeightMB))` and `calculateGrade()` shared from `normalizationService.js`. |
| **5. Green Hosting Carbon Intensity** | **Verified Consistent** | `312 gCO₂/kWh` when Green Web Foundation API returns green (`isGreenHost=true`), `442 gCO₂/kWh` otherwise (`false` / localhost). Verified green hosting changes `carbonIntensity` and `co2`, never `energyUsedKWh`. |
| **6. Resource Category Totals** | **Verified Reconciled** | V1 `buildMetricsPayloadForAi` now persists `totalBytes` & `otherBytes` in `analysis_payload`. Module 1 & Module 2 reconcile `totalBytes === image + script + style + font + other`. Module 3 reconciles `totalBytes === image + javascript + css + htmlAndOther` (`reconciled: true`). |
| **7. Zero-Value Handling** | **Verified Safe** | Real zero-byte DB scan `#9` (`sathyabama.com`) and missing-category scan `#8` (`image_bytes=0`) compute `0` savings without `NaN`/`Infinity`. Module 3 `pctReduction(0, 0)` returns `null` (`"N/A"`). |
| **8. Missing-Value Handling** | **Verified Safe** | Module 1 & Module 2 throw `MISSING_SCAN_TELEMETRY` on empty `{}` / `null` objects instead of substituting zeros. Frontend pages display `"Unavailable"` / `"—"` and empty-state notices instead of `|| 0`. |
| **9. Historical Record Consistency** | **Verified Safe** | Switching scan IDs in Modules 1 & 2 clears stale outputs. Clicking `View` on saved simulations clears stale `comparisonSuite`. Module 3 separates Live Filesystem Measurements from Selected Saved Run records. |
| **10. Frontend ↔ Backend Reconciliation** | **Verified Live** | Playwright UI assertions in `test_module3_data_integrity.js` and `test_live_e2e_v1_v2.js` confirmed rendered UI numbers, Recharts bars, and MySQL-persisted records match backend API payloads exactly. |

---

## 2. Modified Source Files Inventory (Across Audit & Fixes)

### Backend
- `backend/services/normalizationService.js` — exported shared `calculateSustainabilityMetrics`, `calculateGrade`, and constants.
- `backend/services/analysisService.js` — added `otherBytes`, `response.body()` fallback, and reproducible browser config options.
- `backend/routes/analysis.js` — added `totalBytes`, `otherBytes`, `ESTIMATED_ENERGY_KWH`, and `CO2_ESTIMATE_GRAMS` additively.
- `backend/routes/recommendations.js` & `backend/routes/seoRecommendations.js` — lazy OpenAI client initialization so missing `AI_API_KEY` does not crash startup.
- `backend/services/v2DbService.js` & `backend/migrations/001_carbonlens_v2_tables.sql` — additive V2 tables & persistence helpers.
- `backend/services/sustainabilityAgentService.js` & `backend/routes/v2Agent.js` — Module 1 Gemini `reasoning_effort: 'low'` + `AbortController` + `response_format: json_object`, `MISSING_SCAN_TELEMETRY` guard, `measuredFacts`/`engineeringInference`/`generalSuggestion`, `AI-GENERATED`/`RULE-BASED` provenance, fallback cache bypass.
- `backend/services/simulationService.js` & `backend/routes/v2Simulations.js` — Module 2 `MISSING_SCAN_TELEMETRY` guard, green-hosting-only support, `totalBytes` reconciliation, `provenance` block.
- `backend/services/optimizationService.js` & `backend/routes/v2Optimization.js` — Module 3 `sharp.cache(false)` + staging verification + safe in-place sync (Windows `EPERM` fix), `htmlAndOtherBytes` reconciliation, `pctReduction` null safety, `measureControlledSitesInBrowser()`, `FAILED`/`PARTIAL_SUCCESS` DB persistence.
- `backend/scripts/generateControlledSite.js` — removed hardcoded `value="2.5"` in controlled site estimator; uses browser Performance API (`PerformanceNavigationTiming` + `PerformanceResourceTiming`).
- `backend/server.js` — mounted V2 routes and static `/controlled-site/original` & `/controlled-site/optimized`.

### Frontend
- `frontend/src/services/v2Service.js` — V2 API client including `measureControlledSitesBrowser()`.
- `frontend/src/pages/AiAgentPage.js` — Module 1 UI with provenance badges, null-safe formatting, and `MEASURED` Recharts resource chart.
- `frontend/src/pages/SimulatorPage.js` — Module 2 UI initialized from backend catalog (zero hardcoded defaults), stale state clearing, standardized precision, `SIMULATED` badges.
- `frontend/src/pages/OptimizationPage.js` — Module 3 UI separating `MEASURED · DISK`, `MEASURED · BROWSER`, and `CALCULATED`, zero `|| 0` fallbacks, honest empty/failed states, historical run isolation.
- `frontend/src/components/Navbar.js`, `frontend/src/App.js`, `frontend/src/pages/Dashboard.js`, `frontend/src/pages/AnalysisResult.js` — navigation & deep-links preserving all V1 features.

---

## 3. Complete Post-Edit Test Matrix (All Passing)

| Suite | Scope | Result |
|---|---|---|
| `node backend/tests/verify_modules_1_2_3.js` | Modules 1–3 unit, bounds, compounding, `sharp`/`terser`/`clean-css`, Playwright site checks | **15 passed, 0 failed** |
| `node backend/tests/verify_routes_http.js` | Express auth guard + V2 HTTP endpoints (offline DB stub) | **5/5 passed** |
| `node backend/tests/test_module1_data_integrity.js` | M1 missing telemetry, 0-byte `#9`, scan switching `#8` vs `#10`, timeout/invalid JSON fallback, live Gemini (`8,181 ms`) | **6/6 passed** |
| `node backend/tests/test_module2_data_integrity.js` | M2 missing telemetry, 0-byte `#9`, 0-image `#8`, 100%/max bounds, green-only invariance, no-scenario reject, baseline switch | **7/7 passed** |
| `node backend/tests/test_module3_verification.js` | M3 2 consecutive runs under 50ms HTTP polling (`0` `EPERM`), `original/` unchanged, WebP dims, CSS parity, JS interaction | **Passed** |
| `node backend/tests/test_module3_data_integrity.js` | M3 independent `fs.statSync` cross-check (`18,256,665 -> 170,946 B`, `-99.06%`), browser measurement separation, estimator divergence, Recharts UI + screenshots | **5/5 passed** |
| `node backend/tests/test_live_e2e_v1_v2.js` | Full live E2E against `:5000`, `:3000`, Aiven MySQL, and Gemini (`8,910 ms`) + V1 register/login/scan/history/SEO | **7/7 passed** |
| `npm run build` (`frontend/`) | Production React bundle verification | **Compiled successfully** (`207.49 kB` JS, `4.88 kB` CSS) |

---

## 4. Remaining Limitations & Held Scope
- **Legacy pre-audit DB rows (`id <= 10`)**: `page_size` is stored as MySQL `FLOAT`, so Module 1 & Module 2 use a ±16-byte reconciliation guard when `rawScrapedData.totalBytes` is absent; all new scans store exact integer `totalBytes` & `otherBytes` in `analysis_payload`.
- **Module 4 (Before-and-After Validation UI/experiments), CatBoost ML, and PDF Reporting**: Strictly held and unimplemented until your explicit approval.
