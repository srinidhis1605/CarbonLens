-- =============================================================================
-- CarbonLens 2.0 — Additive MySQL Migration (001)
-- Safe to re-run (uses CREATE TABLE IF NOT EXISTS). Preserves all v1 tables.
-- =============================================================================

-- 1. Module 1: AI Sustainability Agent Reports
CREATE TABLE IF NOT EXISTS sustainability_agent_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    analysis_id INT DEFAULT NULL,
    user_id INT NOT NULL,
    target_url VARCHAR(512) NOT NULL,
    generation_mode VARCHAR(64) NOT NULL DEFAULT 'gemini',
    model_name VARCHAR(128) DEFAULT NULL,
    overall_assessment TEXT NOT NULL,
    scan_evidence_json JSON NOT NULL,
    recommendations_json JSON NOT NULL,
    fallback_reason VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sar_user_created (user_id, created_at),
    INDEX idx_sar_analysis (analysis_id),
    CONSTRAINT fk_sar_analysis
        FOREIGN KEY (analysis_id) REFERENCES analysis(id) ON DELETE SET NULL,
    CONSTRAINT fk_sar_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2. Module 2: What-if Optimization Simulations
CREATE TABLE IF NOT EXISTS optimization_simulations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    baseline_analysis_id INT DEFAULT NULL,
    user_id INT NOT NULL,
    target_url VARCHAR(512) NOT NULL,
    simulation_name VARCHAR(200) DEFAULT NULL,
    scenario_config_json JSON NOT NULL,
    assumptions_json JSON NOT NULL,
    baseline_metrics_json JSON NOT NULL,
    simulated_metrics_json JSON NOT NULL,
    comparison_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sim_user_created (user_id, created_at),
    INDEX idx_sim_baseline (baseline_analysis_id),
    CONSTRAINT fk_sim_analysis
        FOREIGN KEY (baseline_analysis_id) REFERENCES analysis(id) ON DELETE SET NULL,
    CONSTRAINT fk_sim_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Module 3: Actual Website Optimization Runs
CREATE TABLE IF NOT EXISTS optimization_runs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    site_name VARCHAR(160) NOT NULL DEFAULT 'controlled-test-website',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    selected_operations_json JSON NOT NULL,
    summary_json JSON NOT NULL,
    operations_log_json JSON NOT NULL,
    errors_json JSON DEFAULT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_optrun_user_started (user_id, started_at),
    CONSTRAINT fk_optrun_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Module 4: Before-and-After Validation Experiments
CREATE TABLE IF NOT EXISTS validation_experiments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    optimization_run_id INT DEFAULT NULL,
    experiment_name VARCHAR(200) NOT NULL,
    original_url VARCHAR(512) NOT NULL,
    optimized_url VARCHAR(512) NOT NULL,
    repetitions INT NOT NULL DEFAULT 3,
    browser_config_json JSON NOT NULL,
    aggregated_baseline_json JSON NOT NULL,
    aggregated_optimized_json JSON NOT NULL,
    comparison_json JSON NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_valexp_user_created (user_id, created_at),
    CONSTRAINT fk_valexp_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_valexp_optrun
        FOREIGN KEY (optimization_run_id) REFERENCES optimization_runs(id) ON DELETE SET NULL
);

-- 5. Module 4: Individual Before-and-After Validation Scan Results
CREATE TABLE IF NOT EXISTS validation_scan_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    experiment_id INT NOT NULL,
    analysis_id INT DEFAULT NULL,
    version VARCHAR(32) NOT NULL, -- 'original' or 'optimized'
    run_index INT NOT NULL,
    scanned_url VARCHAR(512) NOT NULL,
    total_bytes BIGINT DEFAULT 0,
    page_weight_mb FLOAT DEFAULT 0,
    image_bytes BIGINT DEFAULT 0,
    image_count INT DEFAULT 0,
    script_bytes BIGINT DEFAULT 0,
    script_count INT DEFAULT 0,
    style_bytes BIGINT DEFAULT 0,
    style_count INT DEFAULT 0,
    font_bytes BIGINT DEFAULT 0,
    font_count INT DEFAULT 0,
    other_bytes BIGINT DEFAULT 0,
    total_requests INT DEFAULT 0,
    third_party_requests INT DEFAULT 0,
    ttfb_ms INT DEFAULT 0,
    dom_content_loaded_ms INT DEFAULT 0,
    page_load_time_ms INT DEFAULT 0,
    estimated_4g_latency_ms INT DEFAULT 0,
    energy_kwh DOUBLE DEFAULT 0,
    co2_grams DOUBLE DEFAULT 0,
    carbon_score INT DEFAULT 0,
    is_green_host TINYINT(1) DEFAULT 0,
    raw_scan_json JSON DEFAULT NULL,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_valscan_exp_ver (experiment_id, version, run_index),
    CONSTRAINT fk_valscan_exp
        FOREIGN KEY (experiment_id) REFERENCES validation_experiments(id) ON DELETE CASCADE,
    CONSTRAINT fk_valscan_analysis
        FOREIGN KEY (analysis_id) REFERENCES analysis(id) ON DELETE SET NULL
);
