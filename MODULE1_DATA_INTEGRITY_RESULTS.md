# Module 1 — Data Integrity Results (AI Sustainability Agent)

**Scope:** `backend/services/sustainabilityAgentService.js`, `backend/routes/v2Agent.js`, `frontend/src/pages/AiAgentPage.js`  
**Verification Run:** `node backend/tests/test_module1_data_integrity.js` (exit code 0) + `verify_modules_1_2_3.js` + `test_live_e2e_v1_v2.js`

---

## 1. Hardcoded / Fallback Issues Identified & Corrected

| Finding | File | Correction Applied |
|---|---|---|
| Empty/missing scan object `{}` silently converted to `0` bytes and analyzed as if it were a zero-byte scan | `backend/services/sustainabilityAgentService.js` (`buildStructuredScanInput`) | Added explicit `hasExplicitTelemetry` check; throws `MISSING_SCAN_TELEMETRY` (`HTTP 400` in `v2Agent.js`) instead of fabricating `0` measurements. |
| `formatKb(bytes)` in UI used `(Number(bytes) || 0)` and cards used `?? 0`, disguising unavailable fields as `0` | `frontend/src/pages/AiAgentPage.js` | Replaced with explicit `null`/`undefined` checks rendering `"Unavailable"` / `"—"` while preserving genuine measured `0`. |
| Provenance tags used internal strings (`AI_GENERATED_RECOMMENDATION`, `AI_AGENT_DETERMINISTIC_FALLBACK`) instead of standardized labels | `sustainabilityAgentService.js`, `v2Agent.js`, `AiAgentPage.js` | Standardized provenance to `AI-GENERATED`, `RULE-BASED`, `MEASURED`, and `CALCULATED` across API payloads, disclaimers, cards, and UI badges. |
| Module 1 page lacked a visual resource breakdown chart derived from saved scan telemetry | `frontend/src/pages/AiAgentPage.js` | Added Recharts **MEASURED Resource Breakdown** bar chart bound strictly to `activeReport.scanEvidence` (`Images`, `JavaScript`, `CSS`, `Fonts`, `Other`), rendered only when real `totalBytes` is present. |
| Cached deterministic fallback blocked fresh Gemini retries on non-forced requests | `backend/routes/v2Agent.js` | Cached lookup now serves only `gemini` reports automatically when `AI_API_KEY` is configured; old `deterministic_fallback` rows do not block fresh Gemini attempts. |

---

## 2. Actual Data Source & Provenance Mapping

| Displayed Element | Source | Endpoint / DB Field | Classification |
|---|---|---|---|
| Target URL, Total Bytes, Image/JS/CSS/Font/Other Bytes, Request Counts, Timings | MySQL `analysis` + `websites` + `analysis_payload` | `POST /api/v2/agent/analyze`, `GET /api/v2/agent/reports` | **MEASURED** |
| Energy (`kWh`), CO₂ (`g`), Sustainability Score (`/100`), Grade, Carbon Intensity (`312`/`442`) | `calculateSustainabilityMetrics()` (`0.06 kWh/GB`) | Computed from `totalBytes` & `isGreenHost` | **CALCULATED** |
| Recommendations (`measuredFacts`, `engineeringInference`, `generalSuggestion`) when Gemini succeeds | Google Gemini 2.5 Flash (`gemini-2.5-flash`) | `sustainability_agent_reports` (`generation_mode='gemini'`) | **AI-GENERATED** |
| Recommendations when Gemini is unavailable/times out/returns invalid JSON, or on 0-byte scans | `extractMeasurableIssues()` + `buildDeterministicFallbackReport()` | `sustainability_agent_reports` (`generation_mode='deterministic_fallback'`) | **RULE-BASED** |

---

## 3. Executed Test Results (`test_module1_data_integrity.js`)

| Test | Input / Condition | Observed Output | Status |
|---|---|---|---|
| `M1-DI.1` Missing scan telemetry | `{}` and `null` passed to `buildStructuredScanInput` | Threw `MISSING_SCAN_TELEMETRY` (no silent zeros) | **PASS** |
| `M1-DI.2` Zero-byte scan | Live MySQL scan `#9` (`https://sathyabama.com`, `page_size=0`, `3` requests) | `provenance='RULE-BASED'`, `totalBytes=0`, flagged empty payload without calling LLM | **PASS** |
| `M1-DI.3` Switching saved analyses | Live MySQL `#8` (`erp.sathyabama.ac.in`, JS-heavy) vs `#10` (`www.sathyabama.ac.in`, Image-heavy) | `#8` prioritized `JavaScript`; `#10` prioritized `Images`; `totalBytes` differed | **PASS** |
| `M1-DI.4` Gemini timeout | `timeoutMs=30` with delayed mock client | Triggered `RULE-BASED` fallback with explicit timeout `fallbackReason` | **PASS** |
| `M1-DI.5` Invalid AI JSON | Non-JSON string returned from mock client | Triggered `RULE-BASED` fallback with `INVALID_JSON` `fallbackReason` | **PASS** |
| `M1-DI.6` Live Gemini generation | Live MySQL scan `#10` (`https://www.sathyabama.ac.in`) + live Gemini 2.5 Flash | Succeeded in **`14,563 ms`** (`tokens=2365`, `4` recs, `provenance='AI-GENERATED'`, `measuredFacts`/`engineeringInference`/`generalSuggestion` populated) | **PASS** |
