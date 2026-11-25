# Module 3 — Data Integrity Results (Actual Website Optimization)

**Scope:** `backend/services/optimizationService.js`, `backend/routes/v2Optimization.js`, `backend/scripts/generateControlledSite.js`, `frontend/src/pages/OptimizationPage.js`, `frontend/src/services/v2Service.js`  
**Verification Suites:** `test_module3_verification.js`, `test_module3_data_integrity.js`, `verify_modules_1_2_3.js`, `test_live_e2e_v1_v2.js`  
**Saved Measurement Artifacts:** `research/results/module3_data_integrity_measurements.json` & `research/results/module3_data_integrity_measurements.csv`

---

## 1. Hardcoded Values & Fallbacks Removed or Corrected

| ID | Issue Found | Correction Made |
|---|---|---|
| `M3-F1` | Controlled website HTML had hardcoded `<input id="input-page-weight-mb" value="2.5">`, causing Original and Optimized pages to show identical `24.41 GB` monthly transfer | Removed `value="2.5"` from `generateControlledSite.js`; updated `app.js` to auto-measure loaded page weight via `PerformanceNavigationTiming` + `PerformanceResourceTiming` APIs for the served website version. |
| `M3-F2` | `OptimizationPage.js` used `(Number(bytes) || 0)` and `|| 0`, turning missing data into `0.00 KB` | Replaced with explicit null checks (`Unavailable` / `—`) and added empty state `"No measurement data available. Run the optimization pipeline to generate results."` when `!optimized.exists`. |
| `M3-F3` | Disk bar chart omitted `HTML & Other`, leaving chart categories unreconciled with `totalBytes` | Added `HTML & Other` to disk comparison data and added a **Disk Category Size Reduction (%) — Measured** chart driven from backend `siteStatus.comparison`. |
| `M3-F4` / `M3-F5` | `getControlledSiteStatus()` lacked `comparison`, `htmlAndOtherBytes`, timestamp, and returned `0` for 0-byte denominators | Added `htmlAndOtherBytes`, `reconciled` flag, live `comparison`, `measurementTimestamp`, and zero-denominator `pctReduction(0, 0) === null` (`"N/A"` in UI). |
| `M3-F6` | No live browser measurement endpoint or separation of Disk vs Browser vs Calculated values in UI | Added `POST /api/v2/optimization/measure-browser` (`measureControlledSitesInBrowser`) and dedicated UI section separating `MEASURED · DISK`, `MEASURED · BROWSER`, and `CALCULATED`. |
| `M3-F7` | Historical run inspection didn't isolate saved run category metrics clearly | Added dedicated `Selected Run` recorded category cards inside the Execution Log section using `activeRun.summary.byCategory`. |
| `M3-F8` | Temporary scratch preview HTML had static `18.25 MB` / `169.67 KB` labels | Removed static figures from `scratch/side-by-side.html`. |

---

## 2. How Each Graph & Metric Obtains Its Data

1. **Original & Optimized Disk Cards (`MEASURED · DISK`)**: `GET /api/v2/optimization/site-status` -> recursive `walkFiles()` + `fs.statSync()` across `research/test-website/original/` and `research/test-website/optimized/`.
2. **Measured Asset Size Comparison on Disk (KB) BarChart**: Bound directly to `siteStatus.comparison.byCategory` (`images`, `javascript`, `css`, `htmlAndOther`), cross-checked byte-for-byte against an independent `fs.readdirSync` script in `test_module3_data_integrity.js`.
3. **Disk Category Size Reduction (%) — Measured BarChart**: Computed by backend `pctReduction(origBytes, optBytes)` (`((Original - Optimized) / Original) * 100`, `null` if `Original <= 0`).
4. **Live Browser Transfer Measurements (`MEASURED · BROWSER`) & Calculated Estimates (`CALCULATED`)**: `POST /api/v2/optimization/measure-browser` -> runs Playwright Chromium (`1280x720`, cache disabled) against `/controlled-site/original/` and `/controlled-site/optimized/` and computes energy/CO₂ via `calculateSustainabilityMetrics()`.
5. **Optimization Execution Log & Saved Runs**: Persisted in MySQL `optimization_runs` (including `FAILED` and `PARTIAL_SUCCESS` runs) via `POST /api/v2/optimization/run` and `GET /api/v2/optimization/runs`.

---

## 3. Actual Measured Results (Verified on Disk & in Chromium)

### 3.1 Live Filesystem Measurements (`MEASURED · DISK`)
| Category | Original Bytes (Files) | Optimized Bytes (Files) | Bytes Saved | Reduction |
|---|---:|---:|---:|---:|
| **Images** (`sharp` -> WebP q=75) | 17,925,665 B (7) | 156,878 B (7) | 17,768,787 B | **99.12%** |
| **JavaScript** (`terser` + unused removal) | 116,808 B (3) | 3,211 B (2) | 113,597 B | **97.25%** |
| **CSS** (`clean-css` + unused removal) | 207,398 B (3) | 4,024 B (2) | 203,374 B | **98.06%** |
| **HTML & Other** | 6,794 B (1) | 6,833 B (1) | -39 B | **-0.57%** |
| **Total Reconciled** | **18,256,665 B (14)** | **170,946 B (12)** | **18,085,719 B** | **99.06%** |

### 3.2 Live Playwright Browser Measurements (`MEASURED · BROWSER`) & CarbonLens Estimates (`CALCULATED`)
*Chromium `149.0.7827.55`, `1280x720`, `disableCache: true`, `waitUntil: load`, `settleMs: 600`*:

| Metric | Provenance | Original Site | Optimized Site | Delta |
|---|---|---:|---:|---|
| Transferred Bytes | `MEASURED · BROWSER` | 18,256,665 B (17.4109 MB) | 170,946 B (0.1630 MB) | **-99.06%** |
| HTTP Requests | `MEASURED · BROWSER` | 14 | 12 | **-2 reqs** |
| TTFB / DOMContentLoaded / Load | `MEASURED · BROWSER` | 54ms / 946ms / 947ms | 18ms / 298ms / 351ms | Faster |
| Failed Requests | `MEASURED · BROWSER` | 0 | 0 | 0 |
| Energy Estimate (`0.06 kWh/GB`) | `CALCULATED` | 0.00102017 kWh | 0.00000955 kWh | **-0.00101062 kWh** |
| CO₂ Estimate (`442 gCO₂/kWh`) | `CALCULATED` | 0.4509 g | 0.0042 g | **-0.446693 g** |
| Sustainability Score & Grade | `CALCULATED` | 7/100 (Grade F) | 98/100 (Grade A+) | **+91 pts** |

---

## 4. Test Execution Summary & Remaining Limitations
- **`test_module3_verification.js`**: Passed (2 consecutive runs under concurrent 50ms HTTP polling with `0` `EPERM` errors, original untouched, all 7 WebP dimensions valid).
- **`test_module3_data_integrity.js`**: Passed (`M3-DI.1`–`M3-DI.5`: `pctReduction` null check, independent `fs.statSync` match byte-for-byte, separated browser measurement, estimator divergence verified, live React `/optimization` UI rendered `17828.77 KB -> 166.94 KB` and `12` Recharts bars with `0` console errors).
- **Remaining Limitations**:
  - `research/test-website/original/` was regenerated once during this audit to remove the hardcoded `value="2.5"` in the Interactive Traffic Footprint Preview (`18,253,675 B` -> `18,256,665 B` due to Performance API detection code in `app.js`). During optimization runs, `original/` remains strictly immutable (`originalPreserved: true`).
  - Controlled website images are synthetic raster compositions generated via `sharp` for reproducible benchmarking rather than external third-party photographs.
