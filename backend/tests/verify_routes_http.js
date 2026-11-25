// backend/tests/verify_routes_http.js
// Verifies actual Express v2 routes (auth middleware + request validation + JSON responses + static controlled sites)
// over real HTTP without requiring live MySQL credentials (DB layer stubbed explicitly for offline verification).

const assert = require('assert');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'offline-test-jwt-secret-only';

// Stub db.js & v2DbService.js BEFORE loading routes so no MySQL socket is opened
const dbPath = require.resolve('../db');
require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
        query: async () => [[{ 1: 1 }]],
        execute: async () => [[], []],
        getConnection: async () => ({
            beginTransaction: async () => {},
            execute: async () => [{ insertId: 1 }],
            commit: async () => {},
            rollback: async () => {},
            release: () => {},
        }),
    },
};

const sampleScanRow = {
    id: 101,
    user_id: 1,
    url: 'https://sample-heavy-site.example',
    page_size: 2.4796,
    carbon_score: 69,
    co2: 0.0642,
    is_green_host: 0,
    total_requests: 48,
    third_party_requests: 19,
    image_count: 14,
    image_bytes: 1750000,
    script_count: 15,
    script_bytes: 580000,
    style_count: 7,
    style_bytes: 140000,
    font_count: 2,
    font_bytes: 80000,
    analysis_payload: {
        PHASE_3_SPEED_METRICS_TRANSCRIPT: {
            METRICS: {
                SERVER_RESPONSE_LAG_TTFB: '850 ms',
                DOM_STRUCTURAL_READINESS: '1850 ms',
                TOTAL_VISUAL_RENDER_TIME: '3600 ms',
                ESTIMATED_4G_DOWNLOAD_DELAY: '833 ms',
            },
        },
    },
};

const savedAgentReports = [];
const savedSimulations = [];
const savedOptRuns = [];

const v2DbPath = require.resolve('../services/v2DbService');
require.cache[v2DbPath] = {
    id: v2DbPath,
    filename: v2DbPath,
    loaded: true,
    exports: {
        ensureV2Tables: async () => {},
        getRawAnalysisRow: async (userId, analysisId) =>
            Number(analysisId) === 101 && Number(userId) === 1 ? sampleScanRow : null,
        saveAgentReport: async (userId, report) => {
            const id = savedAgentReports.length + 1;
            savedAgentReports.push({ id, userId, ...report });
            return id;
        },
        getAgentReportsByUser: async (userId) => savedAgentReports.filter((r) => r.userId === userId),
        getLatestAgentReportForAnalysis: async () => null,
        saveSimulation: async (userId, sim) => {
            const id = savedSimulations.length + 1;
            savedSimulations.push({ id, userId, ...sim });
            return id;
        },
        getSimulationsByUser: async (userId) => savedSimulations.filter((s) => s.userId === userId),
        getSimulationById: async (userId, id) =>
            savedSimulations.find((s) => s.userId === userId && s.id === Number(id)) || null,
        saveOptimizationRun: async (userId, run) => {
            const id = savedOptRuns.length + 1;
            savedOptRuns.push({ id, userId, ...run });
            return id;
        },
        getOptimizationRunsByUser: async (userId) => savedOptRuns.filter((r) => r.userId === userId),
        getOptimizationRunById: async (userId, id) =>
            savedOptRuns.find((r) => r.userId === userId && r.id === Number(id)) || null,
    },
};

const v2AgentRoutes = require('../routes/v2Agent');
const v2SimulationsRoutes = require('../routes/v2Simulations');
const v2OptimizationRoutes = require('../routes/v2Optimization');
const { ORIGINAL_DIR, OPTIMIZED_DIR } = require('../services/optimizationService');

async function main() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/v2/agent', v2AgentRoutes);
    app.use('/api/v2/simulations', v2SimulationsRoutes);
    app.use('/api/v2/optimization', v2OptimizationRoutes);
    app.use('/controlled-site/original', express.static(ORIGINAL_DIR));
    app.use('/controlled-site/optimized', express.static(OPTIMIZED_DIR));

    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const authHeaders = { Authorization: `Bearer ${token}` };

    try {
        // 1. Auth guard check
        const unauth = await axios.get(`${baseUrl}/api/v2/simulations/scenarios`, {
            validateStatus: () => true,
        });
        assert.strictEqual(unauth.status, 401);
        console.log('PASS HTTP: Auth middleware blocks unauthenticated /api/v2/simulations/scenarios (401)');

        // 2. Module 1 route check
        const agentRes = await axios.post(
            `${baseUrl}/api/v2/agent/analyze`,
            { analysisId: 101 },
            { headers: authHeaders }
        );
        assert.strictEqual(agentRes.status, 200);
        assert.strictEqual(agentRes.data.report.generationMode, 'deterministic_fallback');
        assert.ok(agentRes.data.report.recommendations.length >= 3);
        console.log(
            `PASS HTTP: POST /api/v2/agent/analyze -> ${agentRes.status} (${agentRes.data.report.generationMode}, ${agentRes.data.report.recommendations.length} recommendations)`
        );

        // 3. Module 2 route checks
        const scenariosRes = await axios.get(`${baseUrl}/api/v2/simulations/scenarios`, {
            headers: authHeaders,
        });
        assert.strictEqual(scenariosRes.status, 200);
        assert.ok(scenariosRes.data.scenarios.imageOptimization);

        const simRes = await axios.post(
            `${baseUrl}/api/v2/simulations`,
            {
                baselineAnalysisId: 101,
                simulationName: 'HTTP Route Demo Simulation',
                includeComparisonSuite: true,
                scenarioConfig: {
                    imageOptimization: { enabled: true, compressionPct: 30, webpConversionPct: 35 },
                    javascriptOptimization: { enabled: true, minificationPct: 20, unusedJsReductionPct: 25 },
                },
            },
            { headers: authHeaders }
        );
        assert.strictEqual(simRes.status, 201);
        assert.strictEqual(simRes.data.simulation.resultType, 'SIMULATED / HYPOTHETICAL RESULTS');
        assert.strictEqual(simRes.data.simulation.comparison.reconciliationVerified, true);
        console.log(
            `PASS HTTP: POST /api/v2/simulations -> ${simRes.status} (saved id=${simRes.data.simulation.id}, weight reduction=${simRes.data.simulation.comparison.pageWeightReductionPct}%)`
        );

        // 4. Module 3 route checks + static serving
        const siteStatusRes = await axios.get(`${baseUrl}/api/v2/optimization/site-status`, {
            headers: authHeaders,
        });
        assert.strictEqual(siteStatusRes.status, 200);
        assert.strictEqual(siteStatusRes.data.site.original.exists, true);

        const optRunRes = await axios.post(
            `${baseUrl}/api/v2/optimization/run`,
            { images: true, javascript: true, css: true },
            { headers: authHeaders }
        );
        assert.strictEqual(optRunRes.status, 200);
        assert.strictEqual(optRunRes.data.status, 'COMPLETED');
        console.log(
            `PASS HTTP: POST /api/v2/optimization/run -> ${optRunRes.status} (totalReduction=${optRunRes.data.run.summary.totalReductionPct}%)`
        );

        const origHtmlRes = await axios.get(`${baseUrl}/controlled-site/original/`);
        const optHtmlRes = await axios.get(`${baseUrl}/controlled-site/optimized/`);
        assert.strictEqual(origHtmlRes.status, 200);
        assert.strictEqual(optHtmlRes.status, 200);
        console.log('PASS HTTP: /controlled-site/original/ and /controlled-site/optimized/ both returned HTTP 200');
    } finally {
        server.close();
    }
}

main().catch((err) => {
    console.error('HTTP Route verification failed:', err.response?.data || err);
    process.exit(1);
});
