# CarbonLens 2.0 — CatBoost Carbon Prediction: Future Implementation Plan

> **Current Status:** **Training and Evaluation Pending.**  
> No CatBoost model has been trained, validated, or deployed yet. This document defines the rigorous ML engineering methodology prepared for Phase 2 of CarbonLens 2.0 research.

---

## 1. Motivation & Research Objective

CarbonLens v1 and the deterministic core of CarbonLens 2.0 compute energy and carbon estimates directly from transferred bytes and hosting greenness (`0.06 kWh/GB`, `312` or `442 gCO2/kWh`). While transparent and reproducible, a purely linear byte-transfer model does not capture non-linear client-side energy consumption driven by JavaScript parsing/execution time, DOM complexity, third-party script contention, server response latency, and caching behavior.

CatBoost (Gradient Boosting on Decision Trees with native categorical feature handling) is planned as a modular ML extension once a sufficiently large, high-quality, non-synthetic dataset is collected.

---

## 2. Dataset Requirements & Potential Sources

### Minimum Dataset Requirements
- **Sample size:** Minimum `1,500–5,000` distinct real-world websites across diverse categories (news, e-commerce, SaaS, blogs, government, education, documentation, media-heavy portals) to avoid overfitting.
- **No synthetic inflation:** Training rows must originate from real browser telemetry or verified public web-telemetry corpora — never fabricated rows.
- **Consistent measurement protocol:** Every sample must record browser version, viewport, cache state, and timestamp.

### Candidate Real-World Data Sources
1. **CarbonLens Extended Automated Crawl Dataset:** Respectful, rate-limited Playwright scans collected via CarbonLens across publicly accessible websites (e.g., Tranco top-site stratified sample, honoring `robots.txt` and rate limits).
2. **HTTP Archive (BigQuery public dataset):** Real-world Chrome/Lighthouse page transfer weights, resource breakdowns, request counts, third-party shares, and CrUX / timing telemetry across millions of origins.
3. **Green Web Foundation Dataset:** Open dataset of verified green-hosted domains for joining renewable-energy hosting labels.
4. **External Hardware/Software Power Benchmarks (for true physical energy targets):** Controlled lab measurements using Intel RAPL / Apple Powermetrics / Wattmeter or Green Metrics Tool / Scaphandre / CodeCarbon during controlled browser page loads on a standardized test rig.

---

## 3. Prediction Target Options (Avoiding Formula Circularity)

A critical scientific pitfall in ML-for-sustainability papers is **circular target leakage** (training a tree model to predict `0.06 * GB * 442` from `total_bytes`, which trivially produces `R² ≈ 0.999` without learning anything new). To prevent circularity, genuine CatBoost training must select one of these scientifically defensible targets:

1. **Option A (Strongest for IEEE Paper) — Directly Measured Client/System Energy (Joules or mWh per page load):**
   - Measure actual CPU/package/system energy during standardized Chromium page loads using RAPL/power telemetry across hundreds of diverse websites.
   - Train CatBoost to predict real measured energy consumption from lightweight network & timing features (`image_bytes`, `script_bytes`, `total_requests`, `third_party_requests`, `dom_content_loaded_ms`, `page_load_time_ms`, etc.).
2. **Option B — Independent Multi-Factor Sustainability Benchmark (e.g., SWDM v4 / Lighthouse Performance + Green Hosting Composite / Multi-Page Crawl Carbon):**
   - Predict full-site or multi-factor sustainability score/emissions from fast single-pass lightweight features (explicitly removing any feature that algebraically determines the target).
3. **Option C — Post-Optimization Reduction Potential Prediction:**
   - Train on paired before/after real optimization measurements (controlled sites + open-source web templates) to predict achievable real-world byte/energy savings before executing optimizations.

---

## 4. Feature Engineering Plan

The exact feature extraction contract is already implemented in `backend/services/catboostService.js` (`extractFeaturesFromScan()`):

| Feature Group | Features | Rationale |
|---|---|---|
| **Payload Volume** | `total_bytes`, `page_weight_mb`, `image_bytes`, `script_bytes`, `style_bytes`, `font_bytes`, `other_bytes` | Captures raw transfer footprint by asset class. |
| **Payload Composition Ratios** | `image_share_ratio`, `script_share_ratio`, `style_share_ratio` | Distinguishes image-heavy pages from CPU-heavy JS applications. |
| **Network Concurrency & Dependencies** | `total_requests`, `third_party_requests`, `third_party_ratio`, `image_count`, `script_count`, `style_count`, `font_count` | Captures connection, TLS, DNS, and third-party overhead. |
| **Execution & Latency Telemetry** | `ttfb_ms`, `dom_content_loaded_ms`, `page_load_time_ms` | Captures server latency and client-side parsing/rendering work. |
| **Categorical / Infrastructure** | `is_green_host` (binary categorical; future: `site_category`, `cdn_provider`, `cms_platform`) | Leverages CatBoost's ordered target statistics for categorical features. |

---

## 5. Train / Validation / Test Splitting & Data Leakage Prevention

1. **Domain-Grouped Split (`GroupShuffleSplit` / `GroupKFold` by root eTLD+1 domain):**
   - Never split multiple scans or subpages of the same website across train and test sets.
   - Standard split: **70% Train / 15% Validation (early stopping & hyperparameter tuning) / 15% Holdout Test** (touched strictly once for final paper reporting).
2. **Temporal Holdout Check:**
   - Optionally validate on websites scanned in a later week to verify temporal generalization.
3. **Leakage Prevention Checklist:**
   - Fit all scalers/imputers (if used for baseline linear/MLP comparison models) strictly inside training folds.
   - Exclude target-derived columns (`co2_estimate_grams`, `energy_kwh`, `carbon_score`) from input features when predicting carbon/energy targets.
   - Deduplicate identical URLs and redirect aliases prior to splitting.

---

## 6. Model Evaluation Methodology

1. **Baselines for Fair Comparison:**
   - Compare CatBoost against:
     - Linear Regression / Ridge Regression
     - Random Forest Regressor
     - XGBoost or LightGBM (optional gradient boosting baseline)
2. **Primary Regression Metrics (computed on held-out test set & 5-fold GroupKFold CV):**
   - **MAE** (Mean Absolute Error — interpretable in physical units)
   - **RMSE** (Root Mean Squared Error — penalizes large outliers)
   - **$R^2$** (Coefficient of Determination)
   - **MAPE / sMAPE** (where target values are strictly positive)
3. **Interpretability:**
   - Compute real **SHAP values** (`TreeExplainer`) and CatBoost `PredictionValuesChange` feature importance ONLY after genuine training completes.

---

## 7. Integration Plan into CarbonLens 2.0

The CarbonLens 2.0 backend is already architected for drop-in integration without redesign:

1. Train CatBoost in Python (`research/ml/train_catboost.py`), exporting:
   - `model.cbm` (serialized CatBoost model)
   - `model_metadata.json` (training date, dataset hash, feature order, exact CV & test MAE/RMSE/R²)
2. Run a lightweight Python FastAPI sidecar (`ml_service/app.py`) exposing `POST /predict` and `GET /health` accepting the exact 21-feature JSON contract from `backend/services/catboostService.js`.
3. Configure `CATBOOST_SERVICE_URL=http://localhost:8001` in `backend/.env`.
4. Update `backend/services/catboostService.js` to call `CATBOOST_SERVICE_URL` when configured, switch `/api/v2/ml/status` from `TRAINING_PENDING` to `READY`, and display genuine model predictions alongside real documented test-set metrics in the frontend and PDF Audit Report.
