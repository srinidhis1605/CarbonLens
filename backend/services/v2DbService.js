// backend/services/v2DbService.js
const dbPool = require('../db');

function parseJson(val, fallback = null) {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(val);
    } catch {
        return fallback;
    }
}

async function ensureV2Tables() {
    const statements = [
        `CREATE TABLE IF NOT EXISTS sustainability_agent_reports (
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
            CONSTRAINT fk_sar_analysis FOREIGN KEY (analysis_id) REFERENCES analysis(id) ON DELETE SET NULL,
            CONSTRAINT fk_sar_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS optimization_simulations (
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
            CONSTRAINT fk_sim_analysis FOREIGN KEY (baseline_analysis_id) REFERENCES analysis(id) ON DELETE SET NULL,
            CONSTRAINT fk_sim_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS optimization_runs (
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
            CONSTRAINT fk_optrun_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS validation_experiments (
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
            CONSTRAINT fk_valexp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_valexp_optrun FOREIGN KEY (optimization_run_id) REFERENCES optimization_runs(id) ON DELETE SET NULL
        )`,
        `CREATE TABLE IF NOT EXISTS validation_scan_results (
            id INT AUTO_INCREMENT PRIMARY KEY,
            experiment_id INT NOT NULL,
            analysis_id INT DEFAULT NULL,
            version VARCHAR(32) NOT NULL,
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
            CONSTRAINT fk_valscan_exp FOREIGN KEY (experiment_id) REFERENCES validation_experiments(id) ON DELETE CASCADE,
            CONSTRAINT fk_valscan_analysis FOREIGN KEY (analysis_id) REFERENCES analysis(id) ON DELETE SET NULL
        )`,
    ];

    for (const sql of statements) {
        await dbPool.execute(sql);
    }
}

/**
 * Fetches structured scan row + payload from existing `analysis` table for a user.
 */
async function getRawAnalysisRow(userId, analysisId) {
    const [rows] = await dbPool.execute(
        `SELECT a.*, w.url
         FROM analysis a
         INNER JOIN websites w ON w.id = a.website_id
         WHERE a.id = ? AND a.user_id = ?
         LIMIT 1`,
        [analysisId, userId]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
        ...row,
        analysis_payload: parseJson(row.analysis_payload, null),
        seo_metadata: parseJson(row.seo_metadata, null),
        seo_audit_payload: parseJson(row.seo_audit_payload, null),
    };
}

// ---------- Module 1: AI Sustainability Agent Reports ----------

async function saveAgentReport(userId, report) {
    const [result] = await dbPool.execute(
        `INSERT INTO sustainability_agent_reports (
            analysis_id, user_id, target_url, generation_mode, model_name,
            overall_assessment, scan_evidence_json, recommendations_json, fallback_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            report.analysisId || null,
            userId,
            report.targetUrl || 'unknown',
            report.generationMode || 'gemini',
            report.modelName || null,
            report.overallAssessment || '',
            JSON.stringify(report.scanEvidence || {}),
            JSON.stringify(report.recommendations || []),
            report.fallbackReason || null,
        ]
    );
    return result.insertId;
}

function hydrateAgentReport(row) {
    if (!row) return null;
    return {
        id: row.id,
        analysisId: row.analysis_id,
        userId: row.user_id,
        targetUrl: row.target_url,
        generationMode: row.generation_mode,
        modelName: row.model_name,
        overallAssessment: row.overall_assessment,
        scanEvidence: parseJson(row.scan_evidence_json, {}),
        recommendations: parseJson(row.recommendations_json, []),
        fallbackReason: row.fallback_reason,
        createdAt: row.created_at,
    };
}

async function getAgentReportsByUser(userId, limit = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const [rows] = await dbPool.execute(
        `SELECT * FROM sustainability_agent_reports
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT ${safeLimit}`,
        [userId]
    );
    return rows.map(hydrateAgentReport);
}

async function getLatestAgentReportForAnalysis(userId, analysisId) {
    const [rows] = await dbPool.execute(
        `SELECT * FROM sustainability_agent_reports
         WHERE user_id = ? AND analysis_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [userId, analysisId]
    );
    return hydrateAgentReport(rows[0]);
}

// ---------- Module 2: Optimization Simulations ----------

async function saveSimulation(userId, sim) {
    const [result] = await dbPool.execute(
        `INSERT INTO optimization_simulations (
            baseline_analysis_id, user_id, target_url, simulation_name,
            scenario_config_json, assumptions_json,
            baseline_metrics_json, simulated_metrics_json, comparison_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            sim.baselineAnalysisId || null,
            userId,
            sim.targetUrl || 'unknown',
            sim.simulationName || 'Custom Optimization Simulation',
            JSON.stringify(sim.scenarioConfig || {}),
            JSON.stringify(sim.assumptions || {}),
            JSON.stringify(sim.baseline || {}),
            JSON.stringify(sim.simulated || {}),
            JSON.stringify(sim.comparison || {}),
        ]
    );
    return result.insertId;
}

function hydrateSimulation(row) {
    if (!row) return null;
    return {
        id: row.id,
        baselineAnalysisId: row.baseline_analysis_id,
        userId: row.user_id,
        targetUrl: row.target_url,
        simulationName: row.simulation_name,
        resultType: 'SIMULATED / HYPOTHETICAL RESULTS',
        scenarioConfig: parseJson(row.scenario_config_json, {}),
        assumptions: parseJson(row.assumptions_json, {}),
        baseline: parseJson(row.baseline_metrics_json, {}),
        simulated: parseJson(row.simulated_metrics_json, {}),
        comparison: parseJson(row.comparison_json, {}),
        createdAt: row.created_at,
    };
}

async function getSimulationsByUser(userId, limit = 25) {
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const [rows] = await dbPool.execute(
        `SELECT * FROM optimization_simulations
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT ${safeLimit}`,
        [userId]
    );
    return rows.map(hydrateSimulation);
}

async function getSimulationById(userId, simId) {
    const [rows] = await dbPool.execute(
        `SELECT * FROM optimization_simulations
         WHERE id = ? AND user_id = ?
         LIMIT 1`,
        [simId, userId]
    );
    return hydrateSimulation(rows[0]);
}

async function getLatestSimulationForAnalysis(userId, analysisId) {
    const [rows] = await dbPool.execute(
        `SELECT * FROM optimization_simulations
         WHERE user_id = ? AND baseline_analysis_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [userId, analysisId]
    );
    return hydrateSimulation(rows[0]);
}

// ---------- Module 3: Actual Website Optimization Runs ----------

async function saveOptimizationRun(userId, run) {
    const [result] = await dbPool.execute(
        `INSERT INTO optimization_runs (
            user_id, site_name, status, selected_operations_json,
            summary_json, operations_log_json, errors_json, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
            userId,
            run.siteName || 'controlled-test-website',
            run.status || 'COMPLETED',
            JSON.stringify(run.selectedOperations || {}),
            JSON.stringify(run.summary || {}),
            JSON.stringify(run.operations || []),
            JSON.stringify(run.errors || []),
        ]
    );
    return result.insertId;
}

function hydrateOptimizationRun(row) {
    if (!row) return null;
    return {
        id: row.id,
        userId: row.user_id,
        siteName: row.site_name,
        status: row.status,
        selectedOperations: parseJson(row.selected_operations_json, {}),
        summary: parseJson(row.summary_json, {}),
        operations: parseJson(row.operations_log_json, []),
        errors: parseJson(row.errors_json, []),
        startedAt: row.started_at,
        completedAt: row.completed_at,
    };
}

async function getOptimizationRunsByUser(userId, limit = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const [rows] = await dbPool.execute(
        `SELECT * FROM optimization_runs
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT ${safeLimit}`,
        [userId]
    );
    return rows.map(hydrateOptimizationRun);
}

async function getOptimizationRunById(userId, runId) {
    const [rows] = await dbPool.execute(
        `SELECT * FROM optimization_runs
         WHERE id = ? AND user_id = ?
         LIMIT 1`,
        [runId, userId]
    );
    return hydrateOptimizationRun(rows[0]);
}

// ---------- Module 4: Before-and-After Validation Experiments ----------

async function saveValidationExperiment(userId, experiment) {
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        const [expResult] = await connection.execute(
            `INSERT INTO validation_experiments (
                user_id, optimization_run_id, experiment_name,
                original_url, optimized_url, repetitions, browser_config_json,
                aggregated_baseline_json, aggregated_optimized_json, comparison_json, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                experiment.optimizationRunId || null,
                experiment.experimentName || 'Controlled Before-and-After Validation',
                experiment.originalUrl,
                experiment.optimizedUrl,
                experiment.repetitions || 1,
                JSON.stringify(experiment.browserConfig || {}),
                JSON.stringify(experiment.aggregatedBaseline || {}),
                JSON.stringify(experiment.aggregatedOptimized || {}),
                JSON.stringify(experiment.comparison || {}),
                experiment.status || 'COMPLETED',
            ]
        );

        const experimentId = expResult.insertId;

        const allScans = [
            ...(experiment.baselineScans || []).map((s, idx) => ({ ...s, version: 'original', runIndex: idx + 1 })),
            ...(experiment.optimizedScans || []).map((s, idx) => ({ ...s, version: 'optimized', runIndex: idx + 1 })),
        ];

        for (const scan of allScans) {
            await connection.execute(
                `INSERT INTO validation_scan_results (
                    experiment_id, analysis_id, version, run_index, scanned_url,
                    total_bytes, page_weight_mb, image_bytes, image_count,
                    script_bytes, script_count, style_bytes, style_count,
                    font_bytes, font_count, other_bytes, total_requests,
                    third_party_requests, ttfb_ms, dom_content_loaded_ms,
                    page_load_time_ms, estimated_4g_latency_ms,
                    energy_kwh, co2_grams, carbon_score, is_green_host, raw_scan_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    experimentId,
                    scan.analysisId || null,
                    scan.version,
                    scan.runIndex,
                    scan.url || '',
                    scan.totalBytes || 0,
                    scan.pageWeightMB || 0,
                    scan.imageBytes || 0,
                    scan.imageCount || 0,
                    scan.scriptBytes || 0,
                    scan.scriptCount || 0,
                    scan.styleBytes || 0,
                    scan.styleCount || 0,
                    scan.fontBytes || 0,
                    scan.fontCount || 0,
                    scan.otherBytes || 0,
                    scan.totalRequests || 0,
                    scan.thirdPartyRequests || 0,
                    scan.timeToFirstByteMs || 0,
                    scan.domContentLoadedMs || 0,
                    scan.pageLoadTimeMs || 0,
                    scan.estimated4gLatencyMs || 0,
                    scan.energyUsedKWh || 0,
                    scan.co2EstimateGrams || 0,
                    scan.carbonScore || 0,
                    scan.isGreenHost ? 1 : 0,
                    JSON.stringify(scan),
                ]
            );
        }

        await connection.commit();
        return experimentId;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

function hydrateValidationExperiment(row, scans = null) {
    if (!row) return null;
    return {
        id: row.id,
        userId: row.user_id,
        optimizationRunId: row.optimization_run_id,
        experimentName: row.experiment_name,
        originalUrl: row.original_url,
        optimizedUrl: row.optimized_url,
        repetitions: row.repetitions,
        browserConfig: parseJson(row.browser_config_json, {}),
        aggregatedBaseline: parseJson(row.aggregated_baseline_json, {}),
        aggregatedOptimized: parseJson(row.aggregated_optimized_json, {}),
        comparison: parseJson(row.comparison_json, {}),
        status: row.status,
        createdAt: row.created_at,
        ...(scans
            ? {
                  baselineScans: scans.filter((s) => s.version === 'original'),
                  optimizedScans: scans.filter((s) => s.version === 'optimized'),
              }
            : {}),
    };
}

function hydrateValidationScanRow(row) {
    return {
        id: row.id,
        experimentId: row.experiment_id,
        analysisId: row.analysis_id,
        version: row.version,
        runIndex: row.run_index,
        url: row.scanned_url,
        totalBytes: Number(row.total_bytes) || 0,
        pageWeightMB: Number(row.page_weight_mb) || 0,
        imageBytes: Number(row.image_bytes) || 0,
        imageCount: Number(row.image_count) || 0,
        scriptBytes: Number(row.script_bytes) || 0,
        scriptCount: Number(row.script_count) || 0,
        styleBytes: Number(row.style_bytes) || 0,
        styleCount: Number(row.style_count) || 0,
        fontBytes: Number(row.font_bytes) || 0,
        fontCount: Number(row.font_count) || 0,
        otherBytes: Number(row.other_bytes) || 0,
        totalRequests: Number(row.total_requests) || 0,
        thirdPartyRequests: Number(row.third_party_requests) || 0,
        timeToFirstByteMs: Number(row.ttfb_ms) || 0,
        domContentLoadedMs: Number(row.dom_content_loaded_ms) || 0,
        pageLoadTimeMs: Number(row.page_load_time_ms) || 0,
        estimated4gLatencyMs: Number(row.estimated_4g_latency_ms) || 0,
        energyUsedKWh: Number(row.energy_kwh) || 0,
        co2EstimateGrams: Number(row.co2_grams) || 0,
        carbonScore: Number(row.carbon_score) || 0,
        isGreenHost: row.is_green_host === 1,
        scannedAt: row.scanned_at,
    };
}

async function getValidationExperimentsByUser(userId, limit = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const [rows] = await dbPool.execute(
        `SELECT * FROM validation_experiments
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT ${safeLimit}`,
        [userId]
    );
    return rows.map((row) => hydrateValidationExperiment(row));
}

async function getValidationExperimentById(userId, experimentId) {
    const [rows] = await dbPool.execute(
        `SELECT * FROM validation_experiments
         WHERE id = ? AND user_id = ?
         LIMIT 1`,
        [experimentId, userId]
    );
    if (!rows.length) return null;

    const [scanRows] = await dbPool.execute(
        `SELECT * FROM validation_scan_results
         WHERE experiment_id = ?
         ORDER BY version ASC, run_index ASC`,
        [experimentId]
    );

    return hydrateValidationExperiment(rows[0], scanRows.map(hydrateValidationScanRow));
}

module.exports = {
    ensureV2Tables,
    getRawAnalysisRow,
    saveAgentReport,
    getAgentReportsByUser,
    getLatestAgentReportForAnalysis,
    saveSimulation,
    getSimulationsByUser,
    getSimulationById,
    getLatestSimulationForAnalysis,
    saveOptimizationRun,
    getOptimizationRunsByUser,
    getOptimizationRunById,
    saveValidationExperiment,
    getValidationExperimentsByUser,
    getValidationExperimentById,
};
