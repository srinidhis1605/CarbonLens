# CarbonLens 2.0 — Implementation Plan

## Objective & Priority Schedule

Implement and thoroughly verify the four core CarbonLens 2.0 modules first, prepare the architecture for deferred CatBoost ML integration, add the PDF Sustainability Audit Report, and execute real experimental data collection for IEEE conference paper defensibility.

| Priority | Module | Scope in This Phase |
|---|---|---|
| 1 | **AI Sustainability Agent** | Full implementation, Gemini + validated JSON + deterministic fallback, DB storage, UI, unit & integration tests. |
| 2 | **What-if Optimization Simulator** | Full calculation engine (Images, JS, CSS, Requests + Combined), strict validation, DB storage, Recharts UI, unit & integration tests. |
| 3 | **Actual Website Optimization** | Controlled test website (`original/` vs `optimized/`), real `sharp` + `terser` + `clean-css` pipeline, static serving, DB logs, UI, verification tests. |
| 4 | **Before-and-After Validation** | Repeated Playwright scans under identical config, statistical aggregation (mean/stdDev/min/max), CSV/JSON exports, DB storage, Recharts UI, real executed experiment. |
| 5 | **CatBoost Carbon Prediction** | Feature schema & modular service contract (`TRAINING_PENDING`), pending UI page, `CARBONLENS_CATBOOST_FUTURE_IMPLEMENTATION.md`. No premature training or fake metrics. |
| Bonus | **PDF Sustainability Audit Report** | Server-side PDFKit report with strict provenance labels (Measured / Calculated Estimate / AI / Simulated / Actual Optimization). |

---

## Execution Phases

### Phase 1: Foundation, Dependencies & Database Migrations
- Install existing backend & frontend packages plus `sharp`, `terser`, `clean-css`, `pdfkit` in `backend/`.
- Create `research/` folder hierarchy (`test-website`, `raw_scans`, `processed_data`, `experiments`, `results`, `figures`, `tables`, `reports`).
- Configure local `.env` files for backend (connecting to local MySQL 8 `carbonlens_db`) and frontend (`REACT_APP_API_URL=http://localhost:5000`).
- Enhance `backend/services/normalizationService.js` to export `calculateSustainabilityMetrics` and `calculateGrade`, exposing `energyUsedKWh` and `carbonIntensity` additively.
- Enhance `backend/services/analysisService.js` to add safe response-body byte fallback when `content-length` is missing, track `otherBytes` and asset summary metadata, and accept reproducible scan options (`viewport`, `waitUntil`, `disableCache`).
- Create SQL migration `backend/migrations/001_carbonlens_v2_tables.sql` and `backend/services/v2DbService.js` with idempotent `ensureV2Tables()`.

### Phase 2: Module 1 — AI Sustainability Agent
- Implement `backend/services/sustainabilityAgentService.js`:
  - Full structured input extraction from `analysis` DB rows & payloads.
  - Measurable inefficiency detector with explicit scan evidence.
  - Gemini 2.5 Flash structured JSON prompt with timeout & strict schema validator.
  - Deterministic evidence-based fallback when Gemini fails, times out, rate-limits, or returns invalid JSON.
- Implement `backend/routes/v2Agent.js` (`/api/v2/agent/*`) and mount in `server.js`.
- Keep existing `POST /recommendations` working with improved safety/fallback.

### Phase 3: Module 2 — What-if Optimization Simulator
- Implement `backend/services/simulationService.js`:
  - Configurable scenarios A (Images), B (JS), C (CSS), D (Requests/Third-party), plus Combined mode.
  - Input validation (bounds, no negatives, >100% prevention, anti-double-counting compounding, exact byte reconciliation).
  - Dynamic recalculation of total page size, energy (kWh), CO2 (g), carbon score, grade, and % improvements.
- Implement `backend/routes/v2Simulations.js` (`/api/v2/simulations/*`).

### Phase 4: Module 3 — Actual Website Optimization Demonstration
- Build controlled realistic test website in `research/test-website/original/`:
  - Programmatically generate rich high-res PNG/JPEG raster assets (`hero-banner.png`, `dashboard-preview.png`, `gallery-solar.jpg`, `gallery-datacenter.jpg`, `team-photo.png`, `badge-unoptimized.png`) using `sharp` so every image is genuine and visually inspectable.
  - Create realistic unminified JS files (`app.js`, `analytics-verbose.js`, `legacy-unused-widget.js`) and CSS files (`styles.css`, `components.css`, `legacy-print-unused.css`).
- Implement `backend/services/optimizationService.js`:
  - Real `sharp` image resizing + WebP conversion + compression + validity check.
  - Real `terser` JS minification + unused script removal + `defer` loading.
  - Real `clean-css` CSS minification + unused stylesheet removal.
  - Strictly preserves `original/`, writes to `optimized/`, updates HTML asset references, logs every operation & error, stores runs in MySQL.
- Serve `/controlled-site/original` and `/controlled-site/optimized` from Express.
- Implement `backend/routes/v2Optimization.js` (`/api/v2/optimization/*`).

### Phase 5: Module 4 — Before-and-After Validation
- Implement `backend/services/validationService.js`:
  - Executes `N` repeated Playwright scans on original and `N` repeated scans on optimized controlled website under identical Chromium config (`1280x720`, cache disabled, `load` + fixed settle).
  - Persists individual scans to `analysis` and `validation_scan_results`, and experiment summary to `validation_experiments`.
  - Computes mean, stdDev, min, max, absolute delta, and zero-safe percentage delta for every resource, timing, energy, carbon, and score metric.
  - Generates CSV and JSON exports.
- Implement `backend/routes/v2Validation.js` (`/api/v2/validation/*`).

### Phase 6: Module 5 (CatBoost Architecture) & PDF Audit Report
- Implement `backend/services/catboostService.js` & `backend/routes/v2Ml.js`.
- Write `CARBONLENS_CATBOOST_FUTURE_IMPLEMENTATION.md`.
- Implement `backend/services/pdfReportService.js` & `backend/routes/v2Reports.js`.

### Phase 7: Integrated Frontend (CarbonLens 2.0 UI)
- Update `Navbar.js` and `App.js` with clean protected routes for all new modules.
- Create `frontend/src/services/v2Service.js`.
- Build integrated pages matching CarbonLens Tailwind + Recharts design:
  - `frontend/src/pages/AiAgentPage.js`
  - `frontend/src/pages/SimulatorPage.js`
  - `frontend/src/pages/OptimizationPage.js`
  - `frontend/src/pages/ValidationPage.js`
  - `frontend/src/pages/CatBoostPendingPage.js`
- Enhance `AnalysisResult.js` with direct deep-links ("Open in AI Sustainability Agent", "Simulate in What-if Engine", "Download PDF Audit Report") and `Dashboard.js` with CarbonLens 2.0 quick-access module cards.

### Phase 8: Automated Testing, Real Experiments & Research Outputs
- Write and run automated test suites (`backend/tests/`):
  - Unit tests for AI Agent (valid JSON, invalid JSON, missing fields, API failure, timeout, fallback relevance).
  - Unit tests for What-if Simulator (individual, combined, bounds, invalid inputs, no negatives, no double counting, reconciliation).
  - Integration tests for Actual Optimization (image/JS/CSS size reduction, image validity via sharp, original preservation, Playwright JS functional check).
  - Integration tests for Before-and-After Validation (repeated scans, comparison math, CSV/JSON export, DB storage).
  - Regression tests for v1 functionality (register, login, scan, history, detail, SEO, recommendations).
- Run real research data collection script:
  - Scan 8–10 real publicly accessible websites via CarbonLens scanner -> save raw JSON/CSV in `research/raw_scans/`.
  - Run What-if simulations on those real scanned websites -> save in `research/experiments/`.
  - Run actual optimization + repeated before-and-after validation (e.g., 5 runs baseline + 5 runs optimized) on controlled test website -> save raw & processed datasets in `research/experiments/` and `research/results/`.
  - Programmatically generate research tables (`research/tables/`) and publication-ready SVG charts (`research/figures/`) directly from saved experiment JSON.
- Build frontend (`npm run build`) to confirm zero compilation errors.
- Produce final documentation:
  - `CARBONLENS_V2_METHODOLOGY.md`
  - `CARBONLENS_V2_TEST_REPORT.md`
  - `CARBONLENS_V2_FINAL_IMPLEMENTATION_REPORT.md`
