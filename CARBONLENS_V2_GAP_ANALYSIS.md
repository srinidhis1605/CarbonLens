# CarbonLens 2.0 — Gap Analysis

**Project:** CarbonLens -> CarbonLens 2.0 (AI-Powered Website Sustainability Analysis, Simulation and Optimization)  
**Audit Basis:** Direct source-code inspection of `backend/` and `frontend/` in the existing repository.

---

## 1. What Already Works (Verified in Codebase)

| Capability | Existing Implementation | Status |
|---|---|---|
| User authentication & JWT sessions | `backend/routes/auth.js`, `backend/middleware/authMiddleware.js`, `frontend/src/context/AuthContext.js`, `frontend/src/services/api.js` | Working — bcrypt password hashing, 1h JWT access token + 7d refresh cookie with auto-refresh interceptor. |
| Automated website scanning | `backend/services/analysisService.js` (`analyzeUrlPerformanceOnly`) | Working — headless Playwright Chromium intercepts network responses and extracts Navigation Timing API metrics (`ttfb`, `domReady`, `fullyLoaded`, 4G download estimate). |
| Resource categorization | `backend/services/analysisService.js` | Working — categorizes `image`, `script`, `stylesheet`, and `font` counts and byte weights, plus `totalRequests` and `thirdPartyRequests`. |
| Green hosting detection | `backend/services/normalizationService.js` (`checkGreenHosting`) | Working — queries Green Web Foundation API v3 (`api.thegreenwebfoundation.org/api/v3/greencheck/{domain}`) with 2.5s timeout and safe `false` fallback. |
| Carbon & sustainability estimation | `backend/services/normalizationService.js` (`normalizeAnalysisData`) | Working — documented formula: `energyUsedKWh = totalWeightGB * 0.06`, `carbonIntensity = isGreenHost ? 312 : 442` gCO2/kWh, `co2EstimateGrams = energyUsedKWh * carbonIntensity`, `carbonScore = round(100 * exp(-0.15 * totalWeightMB))`, grade A+ through F. |
| Basic Gemini AI recommendations | `backend/routes/recommendations.js` (`fetchAiAdvice`) | Working (basic) — uses `openai` SDK pointed at Gemini OpenAI-compatible endpoint (`gemini-2.5-flash`) to generate 3 JSON recommendation cards. |
| SEO audit & hybrid SEO AI | `backend/services/crawlerService.js`, `backend/services/seoParser.js`, `backend/routes/seoRecommendations.js`, `frontend/src/components/SeoReport.js` | Working — BFS HTTP crawl, robots.txt, sitemap.xml, metadata/OG/compliance extraction, deterministic rules + Gemini keyword advice, CSV export of crawled URLs. |
| Database persistence & scan history | `backend/db.js`, `backend/services/dbService.js`, `backend/database.sql`, `backend/database-aiven.sql` | Working — MySQL (`mysql2/promise`) with `users`, `websites`, `analysis` tables and full JSON payload restoration for history. |
| Dashboard & visualizations | `frontend/src/pages/Dashboard.js`, `frontend/src/pages/AnalysisResult.js`, `frontend/src/components/AnalysisSummary.js`, `frontend/src/components/charts/*` | Working — Tailwind CSS UI with Recharts (`PerformanceScoreDonut`, `PerformanceWaterfallChart`, `AssetBreakdownChart`, `AuditChecklistGrid`). |

---

## 2. What Needs Enhancement

1. **Scanner Byte Accounting & Measurement Fidelity (`backend/services/analysisService.js`)**
   - Currently relies solely on `response.headers()['content-length']`. Responses using chunked transfer encoding or HTTP/2 without `content-length` report `0` bytes.
   - Enhancement: Add safe body-size fallback / transfer-size measurement when `content-length` is missing, track `otherBytes` so resource categories reconcile cleanly with `totalBytes`, and accept optional scan configuration (`viewport`, `waitUntil`, `disableCache`, `captureAssetDetails`) for reproducible controlled experiments while preserving default behavior.
2. **Environmental Formula Reuse & Energy Exposure (`backend/services/normalizationService.js`)**
   - `energyUsedKWh` is computed internally in `normalizeAnalysisData()` but discarded before returning.
   - `co2EstimateGrams` is stored in MySQL `analysis.co2` and `AI_METRICS_INPUT`, but omitted from `PHASE_2_ENVIRONMENTAL_RECONSTRUCTION.RECONSTRUCTED_METRICS`.
   - Enhancement: Export a pure, deterministic `calculateSustainabilityMetrics({ totalBytes, isGreenHost })` helper so the scanner, What-if Simulator, and Before-and-After Validation share the exact same documented methodology without drift. Return `energyUsedKWh` and `carbonIntensity` additively without breaking existing keys.
3. **AI Sustainability Recommendations -> AI Sustainability Agent (`backend/routes/recommendations.js` + new service)**
   - Current implementation only passes a subset of metrics (omits TTFB, DOMContentLoaded, load time, font bytes, third-party requests, energy estimate, green hosting status).
   - No strict schema validation, no request timeout, no deterministic fallback when Gemini fails/times out/rate-limits/returns invalid JSON, and no evidence-to-recommendation linkage.
   - Output only contains 4 fields (`impact`, `category`, `title`, `description`) and lacks evidence, rationale ("why it matters"), expected direction of improvement, and implementation difficulty.
   - Enhancement: Keep `POST /recommendations` backward-compatible while building a dedicated `sustainabilityAgentService.js` producing full structured, validated, evidence-backed JSON reports with deterministic fallback and MySQL persistence.
4. **Navigation & Dashboard Integration (`frontend/src/components/Navbar.js`, `frontend/src/App.js`)**
   - Current navbar only has brand link and Logout.
   - Enhancement: Add clean top-level navigation to Dashboard, AI Sustainability Agent, What-if Simulator, Website Optimization, Before-and-After Validation, and CatBoost Prediction (Pending) without breaking existing routes.

---

## 3. What Needs to Be Newly Implemented

1. **Module 1 — AI Sustainability Agent (Enhanced Backend + Dedicated UI + DB Storage)**
   - Evidence extractor analyzing real scan measurements against transparent engineering thresholds.
   - Structured Gemini 2.5 Flash agent with strict schema validator, timeout handling, retry/fallback to deterministic evidence-based rules.
   - Persistence in `sustainability_agent_reports`.
   - Integrated AI Sustainability Agent page & link from existing Analysis Result page.
2. **Module 2 — What-if Optimization Simulator**
   - Pure calculation engine (`backend/services/simulationService.js`) supporting Scenario A (Images), Scenario B (JavaScript), Scenario C (CSS), Scenario D (Requests / Third-party), and combined scenarios.
   - Strict input validation preventing negative bytes, >100% reductions, double-counting of overlapping optimizations (multiplicative compounding within a category with capped effective ceiling), and non-reconciling totals.
   - Persistence in `optimization_simulations`.
   - Interactive Recharts UI with clear **SIMULATED / HYPOTHETICAL RESULTS** labeling.
3. **Module 3 — Actual Website Optimization Demonstration**
   - Controlled test website in `research/test-website/original/` containing genuine multi-asset HTML, unoptimized high-resolution PNG/JPEG images, unminified + unused JavaScript, and unminified + unused CSS.
   - Real optimization pipeline (`backend/services/optimizationService.js`) using `sharp` (compression, WebP conversion, resizing), `terser` (JS minification + unused script removal), and `clean-css` (CSS minification + unused stylesheet removal), outputting to `research/test-website/optimized/` while strictly preserving `original/`.
   - Express static hosting of both `/controlled-site/original` and `/controlled-site/optimized` for live browser inspection and Playwright scanning.
   - Persistence in `optimization_runs` and dedicated Website Optimization UI.
4. **Module 4 — Before-and-After Validation**
   - Controlled experiment runner (`backend/services/validationService.js`) executing repeated Playwright scans of original vs. optimized controlled website under identical Chromium configuration (same viewport, headless mode, cache disabled, settle timing).
   - Individual scan storage + statistical aggregation (mean, min, max, standard deviation, absolute/percentage deltas with zero-denominator guards).
   - Persistence in `validation_experiments` and `validation_scan_results`.
   - CSV and JSON experiment exports + Recharts comparison UI.
5. **Module 5 — CatBoost Carbon Prediction (Architecture-Ready, Deferred Training)**
   - Modular prediction service contract (`backend/services/catboostService.js`) defining feature extraction schema from scan data and returning `status: "TRAINING_PENDING"`.
   - Frontend placeholder page clearly marked **CatBoost Model — Training and Evaluation Pending** (zero fabricated metrics).
   - Future implementation plan in `CARBONLENS_CATBOOST_FUTURE_IMPLEMENTATION.md`.
6. **PDF Sustainability Audit Report (Part 10)**
   - Server-side PDF generator (`backend/services/pdfReportService.js` using `pdfkit`) clearly separating Measured, Calculated Estimate, AI-Generated Recommendation, Simulated Result, and Actual Optimization Result sections.
7. **Research Data Collection & Reproducible Framework (Part 11)**
   - Directory structure under `research/` (`test-website`, `raw_scans`, `processed_data`, `experiments`, `results`, `figures`, `tables`, `reports`).
   - Reproducible Node.js scripts to scan 8–10 real public websites, run controlled before-and-after experiments, and programmatically generate CSV/JSON/Markdown tables and SVG/HTML figures directly from saved raw data.

---

## 4. Reusable Existing Services

| Existing Module | How CarbonLens 2.0 Reuses It |
|---|---|
| `backend/services/analysisService.js` | Reused directly for standard scans, public-site research scans, and controlled before-and-after validation scans (with additive options). |
| `backend/services/normalizationService.js` | Core carbon/energy/score equations refactored into reusable pure functions called by scanner, What-if Simulator, and Validation Engine. |
| `backend/services/dbService.js` & `backend/db.js` | Reused for MySQL pool, analysis retrieval (`getAnalysisById`, `getAnalysisHistory`), and idempotent schema migrations. |
| `backend/middleware/authMiddleware.js` | Reused to protect all new `/api/v2/*` routes and isolate records per authenticated `req.user.id`. |
| `frontend/src/services/api.js` | Reused Axios client with automatic JWT attachment and refresh-token retry. |
| `frontend/src/components/AnalysisHistoryList.js` & charts | Reused design tokens (`brand` green `#16a34a`, slate borders, Recharts patterns). |

---

## 5. Required Database Changes (Non-Breaking Additive Migration)

Existing tables (`users`, `websites`, `analysis`) remain intact with zero destructive alterations. Five additive tables will be created via `backend/migrations/001_carbonlens_v2_tables.sql` and ensured idempotently at server startup:

1. `sustainability_agent_reports` — stores structured AI agent outputs, evidence summary, provider mode (`gemini` vs `deterministic_fallback`), linked to `analysis_id` and `user_id`.
2. `optimization_simulations` — stores baseline `analysis_id`, scenario configuration, reduction assumptions, simulated byte/energy/carbon/score outputs, linked to `user_id`.
3. `optimization_runs` — stores controlled-website optimization execution logs, affected files, original vs. optimized bytes, status, errors, linked to `user_id`.
4. `validation_experiments` — stores experiment metadata, browser configuration, repetition count, aggregated comparison statistics, linked to `user_id` and `optimization_run_id`.
5. `validation_scan_results` — stores every individual baseline and optimized Playwright scan measurement (version, run index, bytes, requests, timing, energy, CO2, score, linked `analysis_id`), enabling full statistical transparency and CSV/JSON export.

---

## 6. Potential Technical Issues & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Missing `backend/.env` / `frontend/.env` in fresh checkout | Server fails fast on startup (`Missing PORT` / `Missing FRONTEND_ORIGIN`). | Configure local `.env` files (without committing secrets) and document required variables clearly. |
| Missing or rate-limited `AI_API_KEY` (Gemini) | AI Agent requests could fail or stall demos. | Implement strict 20s timeout, JSON parsing/schema validation, and deterministic evidence-based fallback engine clearly labeled as fallback. |
| `Content-Length` header absent on chunked/HTTP2 public sites | Under-reported byte metrics during scans. | Use safe response buffer length fallback when `content-length` header is omitted. |
| Double-counting in combined What-if scenarios | Inflated, mathematically invalid savings (>100% or mismatched totals). | Apply multiplicative compounding within each asset category (`remaining = baseline * Π(1 - r_i)`), enforce per-slider bounds and category caps, and reconcile `totalBytes = images + scripts + styles + fonts + other`. |
| Overwriting original controlled website assets | Corrupts baseline for reproducible experiments. | Treat `research/test-website/original/` as strictly read-only; write all optimized outputs exclusively to `research/test-website/optimized/`. |
| Localhost scanning vs. Green Web Foundation API | `localhost` / `127.0.0.1` is not a public domain in Green Web API. | Skip external Greencheck network lookup for localhost/private IPs (deterministically set `isGreenHost = false`, explicitly documented as local controlled test host) to avoid 2.5s timeouts and inconsistent results. |
| Express 5 route parameter/wildcards | Express 5 (`^5.2.1`) is stricter on path syntax. | Use standard explicit Express 5 route paths and test every endpoint directly. |

---

## 7. Recommended Implementation Order

1. **Stage 1 (Done / In Progress):** Codebase audit, Gap Analysis, Architecture, Implementation Plan, dependency installation, and DB migration setup.
2. **Stage 2 (Module 1):** AI Sustainability Agent service, routes, tests, and frontend view.
3. **Stage 3 (Module 2):** What-if Optimization Simulator calculation engine, routes, persistence, tests, and frontend view.
4. **Stage 4 (Module 3):** Controlled test website + actual Image/JS/CSS optimization service (`sharp`, `terser`, `clean-css`), routes, persistence, tests, and frontend view.
5. **Stage 5 (Module 4):** Before-and-After Validation service, repeated Playwright experiment runner, statistical comparison, CSV/JSON export, routes, and frontend view.
6. **Stage 6 (CatBoost Placeholder + PDF Report):** Architecture-ready CatBoost interface & pending UI + PDF Sustainability Audit Report generator + `CARBONLENS_CATBOOST_FUTURE_IMPLEMENTATION.md`.
7. **Stage 7 (Integration, Experiments & Verification):** End-to-end frontend integration, real public website scans (8–10 sites), controlled before-and-after repeated experiments, regression testing, programmatic research tables/figures, and final reports.
