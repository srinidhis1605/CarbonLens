# CarbonLens 2.0 — Diagnostic Results (Modules 1–3)

**Scope:** Read-only diagnostic of live MySQL records, Gemini API connectivity/latency, and Module 3 Windows `EPERM` failure prior to applying code fixes.  
**Constraint Compliance:** No database records were modified, inserted, or deleted; no secrets, passwords, API keys, or user PII/emails were printed; Module 4 was not implemented.

---

## 1. Actual MySQL Database Verification Results (Verified — Live Aiven MySQL)

Executed `SELECT`-only queries via `diagnose_db_gemini.js` against the configured database in `backend/.env`:

### 1.1 Existing Scan Records (`analysis` + `websites`, latest 5)
| ID | Target URL | `page_size` (MB) | `carbon_score` | `co2` (g) | `is_green_host` | `total_requests` | `third_party_requests` | `image_bytes` (`count`) | `script_bytes` (`count`) | `style_bytes` (`count`) | `font_bytes` (`count`) | `has_payload` |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| 10 | `https://www.sathyabama.ac.in` | 11.6048 | 18 | 0.3005 | 0 | 92 | 22 | 11,074,881 (61) | 932,000 (18) | 47,659 (6) | 113,956 (4) | Yes |
| 9 | `https://sathyabama.com` | 0 | 100 | 0 | 0 | 3 | 2 | 0 (0) | 0 (1) | 0 (0) | 0 (0) | Yes |
| 8 | `https://erp.sathyabama.ac.in` | 5.6116 | 43 | 0.1453 | 0 | 14 | 5 | 0 (0) | 5,185,974 (8) | 655,061 (2) | 43,136 (1) | Yes |
| 7 | `https://neetcode.io` | 0.7567 | 89 | 0.0196 | 0 | 19 | 5 | 0 (0) | 755,486 (17) | 32,000 (1) | 0 (0) | Yes |
| 6 | `https://hexaware.com` | 7.3283 | 33 | 0.1898 | 0 | 113 | 112 | 6,992,610 (70) | 525,939 (27) | 116,343 (11) | 24,376 (1) | Yes |

**Key Observations (Verified):**
- Real V1 scan records exist and are persisted in MySQL with `analysis_payload` intact.
- Record `#9` (`https://sathyabama.com`) is a real **zero-byte edge case** (`page_size = 0`, `total_requests = 3`, `script_count = 1`, `script_bytes = 0`).
- Record `#10` (`https://www.sathyabama.ac.in`) has `image + script + style + font = 12,168,496` bytes vs. `page_size * 1024 * 1024 ≈ 12,168,500` bytes (`4` bytes `otherBytes` — note `page_size` is stored as MySQL `FLOAT`, introducing single-precision rounding).

### 1.2 Saved AI Sustainability Agent Reports (`sustainability_agent_reports`)
| Report ID | `analysis_id` | Target URL | `generation_mode` | `model_name` | `fallback_reason` | `created_at` |
|---:|---:|---|---|---|---|---|
| 1 | 10 | `https://www.sathyabama.ac.in` | `deterministic_fallback` | `null` | `"Gemini API timeout (20000ms) — fell back to deterministic evidence engine."` | `2026-11-25T10:59:38.000Z` |

**Verified Behavior & Root Cause:**
- Report `#1` hit the 20,000 ms timeout and fell back to `deterministic_fallback`.
- Furthermore, in `backend/routes/v2Agent.js` (lines 25–39), `POST /api/v2/agent/analyze` returns the cached report from `getLatestAgentReportForAnalysis()` whenever `forceRefresh` is `false`. Consequently, every subsequent non-forced "Analyze Scan" request for `#10` returns the stored fallback report without retrying Gemini.

### 1.3 Saved What-if Simulations (`optimization_simulations`)
- **Result:** `[]` (0 rows currently persisted in MySQL).
- Users either used **Preview** (`POST /api/v2/simulations/preview`) or had not yet clicked **Run & Save Simulation to DB** (`POST /api/v2/simulations`).

### 1.4 Saved Optimization Runs (`optimization_runs`) vs. Live Backend Logs (`task-202.log`)
| Run ID | `site_name` | `status` | `errors_json` | `started_at` |
|---:|---|---|---|---|
| 1 | `controlled-test-website` | `COMPLETED` | `[]` | `2026-11-25T11:07:43.000Z` |

**Verified Mismatch Between DB and Live Execution Logs:**
- In `task-202.log` (lines 13–67), **5 consecutive `POST /api/v2/optimization/run` requests failed** with:
  ```
  Error: EPERM, Permission denied: \\?\C:\Users\Sri\Desktop\carbonlens2.0\CarbonLens\research\test-website\optimized
      at Object.rmSync (node:fs:1222:18)
      at cleanOptimizedDirectory (C:\Users\Sri\Desktop\carbonlens2.0\CarbonLens\backend\services\optimizationService.js:143:12)
  ```
- Because `cleanOptimizedDirectory()` threw *before* `saveOptimizationRun()` in `backend/routes/v2Optimization.js`, **none of those 5 failed attempts were recorded in `optimization_runs`**.
- Meanwhile, `frontend/src/pages/OptimizationPage.js` (`loadData`, lines 52–54) sets `activeRun = runsData[0]` when `!activeRun`. As a result, when a user opens the page or triggers a failing run, Run `#1` (`COMPLETED`) remains displayed below the error banner, creating the misleading impression of a successful optimization alongside an `EPERM` failure.

---

## 2. Gemini API Connectivity & Latency Verification (Verified — Live API)

Executed one minimal request (`Return {"ok":true}`) against Google AI Studio's OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`) with `backend/.env`:

- **Configured Model (`AI_MODEL`):** `gemini-2.5-flash` (default)
- **Configured Timeout (`AI_TIMEOUT_MS`):** `20000` ms (default)
- **API Key Configured:** `true` (key never printed)
- **Connection Status:** **SUCCEEDED** (`finish_reason: "stop"`)
- **Actual Response Latency:** **`1,121 ms`**
- **Token Usage:** `prompt_tokens: 14`, `completion_tokens: 10`, `total_tokens: 24`
- **Raw Content Returned:** ```` ```json\n{"ok":true}\n``` ````

### Confirmed Root Causes & Inferred Analysis for 20s Timeout
1. **Verified:** The Gemini API key, base URL, and `gemini-2.5-flash` model are live and reachable (`1,121 ms` for a trivial 24-token exchange).
2. **Verified Code Gap (`backend/services/sustainabilityAgentService.js`):**
   - `callWithTimeout()` wraps the call in `Promise.race(..., 20000ms)` without passing `{ timeout }` or an `AbortController` signal to `client.chat.completions.create(...)`, so timed-out HTTP requests are not aborted cleanly.
   - `response_format: { type: 'json_object' }` is not enabled, and `reasoning_effort` is not bounded (Gemini 2.5 Flash performs internal thinking tokens by default on complex prompts).
   - `buildAgentPrompt()` requests 3–6 multi-paragraph objects with 8 verbose text fields (~1,500–2,500 output tokens + thinking overhead), which frequently exceeds 20 seconds on Gemini 2.5 Flash's default reasoning configuration. (This specific cause of the `#10` 20s timeout is **inferred** from the verified 20s timeout error on `#10` vs. the 1.12s minimal call.)
3. **Verified Scientific-Claim Issues in `sustainabilityAgentService.js` Fallback:**
   - Line 183 (`excessive-javascript`) asserts *"client-side CPU parsing/execution energy overhead"* without measuring CPU energy.
   - Line 263 (`slow-loading-caching`) asserts *"keep client and server hardware active longer"* without server-side energy/hardware profiling.
   - Neither Gemini nor fallback recommendations currently separate **Measured Facts**, **Engineering Inferences**, and **General Suggestions**.

---

## 3. Module 3 `EPERM` Root Cause & Safe Regeneration Plan

- **Exact Failing Call (Verified):** `fs.rmSync(OPTIMIZED_DIR, { recursive: true, force: true })` at `backend/services/optimizationService.js:143` inside `cleanOptimizedDirectory()`.
- **Root Cause:** Deleting the `research/test-website/optimized` root directory itself on Windows raises `EPERM` whenever another process or handle references the directory or a child file (e.g., `express.static(OPTIMIZED_DIR)` in `backend/server.js`, the secondary preview server `task-192`, open browser previews, Windows Search/Defender, or `sharp`/`libvips` file caching—note `sharp.cache(false)` is not currently set).
- **Recommended Safe Regeneration Strategy:**
  1. Never delete or `rmdir` `OPTIMIZED_DIR` itself; keep `research/test-website/original/` strictly read-only.
  2. Call `sharp.cache(false)` so `libvips` immediately releases file handles on Windows.
  3. Generate all optimized outputs into a fresh temporary sibling staging directory (`research/test-website/.optimized-staging-<timestamp>`), validate every generated asset (images via `sharp().metadata()`, JS syntax via `new vm.Script` / Terser verify, CSS non-empty, HTML asset references present), and then **sync files into `OPTIMIZED_DIR`** (overwriting existing files in-place and unlinking only stale files with retry on transient `EBUSY`/`EPERM`, removing the staging folder afterward).
  4. If an individual file optimization or write fails, record it as `FAILED` in `operations[]` and `errors[]`, persist the `FAILED`/`PARTIAL_SUCCESS` run to `optimization_runs`, and never show a prior `COMPLETED` run as the current run result in `OptimizationPage.js`.
  5. Recompute directory/asset sizes directly from the live filesystem after writing (`summarizeDirectory(ORIGINAL_DIR)` and `summarizeDirectory(OPTIMIZED_DIR)`).

---

## 4. Additional Cross-Module & Code Audit Findings (Verified in Source)

1. **Module 1 (`v2Agent.js` & `sustainabilityAgentService.js`)**:
   - Cached fallback reports block retries on `Analyze Scan` (`forceRefresh=false`). Fix: do not return cached `deterministic_fallback` reports as final when `AI_API_KEY` is configured (or clearly offer/default retry when previous cached report was a fallback).
   - Separate `measuredFacts`, `engineeringInference`, and `generalSuggestion` fields in the schema, remove unsupported CPU/server hardware energy claims, and enforce compact JSON output + appropriate timeout / `AbortController` / `reasoning_effort: "low"` (or verified fast Gemini settings).
2. **Module 2 (`simulationService.js` & `SimulatorPage.js`)**:
   - `SimulatorPage.js` does not clear `result` and `comparisonSuite` when switching `selectedAnalysisId`, so results from a previously selected site remain visible until re-run.
   - `SimulatorPage.js` displays `TOTAL_TRANSMITTED_WEIGHT` (`toFixed(2) MB`) in the baseline preview strip vs. `pageWeightMB` (`toFixed(4) MB`) in simulation cards, and `AiAgentPage.js` displays `co2EstimateGrams` (4 decimals) while `SimulatorPage.js` displays `co2EstimateGramsPrecise` (6 decimals). Standardize display precision and show exact byte reconciliation (`totalBytes`, `KB`, `MB`).
   - Verify & test `totalBytes = 0` (like real DB row `#9`) and green-hosting-only toggle (`carbonIntensity` changes, `energyUsedKWh` stays invariant).
   - Store exact `total_bytes` (or derive consistently from `analysis_payload` + `rawScrapedData` when available, falling back cleanly to `page_size`) so `page_size` `FLOAT` rounding never causes a byte mismatch between Module 1 and Module 2.
3. **Module 3 (`optimizationService.js` & `OptimizationPage.js`)**:
   - Fix `EPERM` directory deletion bug; persist failed runs too; prevent `OptimizationPage.js` from displaying an older successful `activeRun` when a new run fails or when inspecting current filesystem state; add automated Playwright visual/layout + image-dimensions + broken-asset + JS/CSS functional verification checks.

---

## Next Step — Waiting for Your Approval

Diagnostic verification is complete and **no code fixes or Module 4 work have been applied**. Please confirm that you approve proceeding to apply the Modules 1–3 fixes listed above and run the complete verification suite (including live Gemini, live MySQL, and live Playwright checks) and produce `CARBONLENS_V2_ACCURACY_AUDIT.md`.
