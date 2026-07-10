// backend/routes/analysis.js
const express = require('express');
const router = express.Router();

// 1. Core Service Imports
const { analyzeUrlPerformanceOnly, analyzeUrlSeoSuite } = require('../services/analysisService');
const { normalizeAnalysisData, checkGreenHosting } = require('../services/normalizationService');
const authenticateToken = require('../middleware/authMiddleware');
const {
    saveAnalysisResult,
    saveAnalysisPayload,
    updateSeoMetadata,
    saveSeoAuditPayload,
    getAnalysisHistory,
    getAnalysisById,
} = require('../services/dbService');

// =========================================================================
// 🎯 LINK THE DEDICATED HYBRID RECOMMENDATION ENGINES HERE
// =========================================================================
// Phase 2 SEO AI
const { fetchSeoAiAdvice } = require('./seoRecommendations');

function toSafeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function calculateGrade(score) {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 65) return 'C';
    if (score >= 50) return 'D';
    if (score >= 35) return 'E';
    return 'F';
}

function buildMetricsPayloadForAi(normalized, rawData) {
    const totalRequests = Math.floor(toSafeNumber(rawData.totalRequests));
    const thirdPartyRequests = Math.floor(toSafeNumber(rawData.thirdPartyRequests));
    const imageCount = Math.floor(toSafeNumber(rawData.imageCount));
    const imageBytes = toSafeNumber(rawData.imageBytes);
    const scriptCount = Math.floor(toSafeNumber(rawData.scriptCount));
    const scriptBytes = toSafeNumber(rawData.scriptBytes);
    const styleCount = Math.floor(toSafeNumber(rawData.styleCount));
    const styleBytes = toSafeNumber(rawData.styleBytes);
    const fontCount = Math.floor(toSafeNumber(rawData.fontCount));
    const fontBytes = toSafeNumber(rawData.fontBytes);

    return {
        pageWeightMB: normalized.pageWeightMB,
        carbonScore: normalized.carbonScore,
        co2EstimateGrams: normalized.co2EstimateGrams,
        rawScrapedData: {
            totalRequests,
            thirdPartyRequests,
            imageCount,
            imageBytes,
            scriptCount,
            scriptBytes,
            styleCount,
            styleBytes,
            fontCount,
            fontBytes,
        },
        display: {
            imagesMB: (imageBytes / (1024 * 1024)).toFixed(2),
            scriptsMB: (scriptBytes / (1024 * 1024)).toFixed(2),
            stylesMB: (styleBytes / (1024 * 1024)).toFixed(2),
            fontsMB: (fontBytes / (1024 * 1024)).toFixed(2),
            totalRequests,
            thirdPartyRequests,
            imageCount,
            scriptCount,
            styleCount,
            fontCount,
        },
    };
}

function buildPerformanceResponse(url, normalized, metricsPayloadForAi, options = {}) {
    const {
        performanceAiAdvice = [],
        writeDbReceipt = null,
        persistenceStatus = 'STORED',
    } = options;
    const display = metricsPayloadForAi.display;
    const grade = calculateGrade(normalized.carbonScore);

    return {
        SESSION_STATUS: 'PERFORMANCE_ANALYSIS_COMPLETED',
        TARGET_HOST: new URL(url).hostname.replace('www.', ''),
        TIMESTAMP_EPOCH: Date.now(),
        DATABASE_RECORD_ID:
            writeDbReceipt && writeDbReceipt.insertId ? writeDbReceipt.insertId : null,
        AI_METRICS_INPUT: metricsPayloadForAi,
        PHASE_1_RAW_SOCKET_INTERCEPTION: {
            STATUS: 'DATA_HARVEST_SUCCESSFUL',
            INTERCEPTED_TRAFFIC: {
                TOTAL_NETWORK_REQUESTS_LOGGED: display.totalRequests,
                FOREIGN_THIRD_PARTY_INJECTIONS: display.thirdPartyRequests,
            },
            EXTRACTED_PAYLOAD_SIGNATURES: [
                { CLASSIFICATION: 'BINARY_IMAGES', COUNT: display.imageCount, RAW_WEIGHT: `${display.imagesMB} MB` },
                { CLASSIFICATION: 'CLIENT_JS_SCRIPTS', COUNT: display.scriptCount, RAW_WEIGHT: `${display.scriptsMB} MB` },
                { CLASSIFICATION: 'COMPRESSED_STYLES', COUNT: display.styleCount, RAW_WEIGHT: `${display.stylesMB} MB` },
                { CLASSIFICATION: 'EMBEDDED_FONTS', COUNT: display.fontCount, RAW_WEIGHT: `${display.fontsMB} MB` },
            ],
        },
        PHASE_2_ENVIRONMENTAL_RECONSTRUCTION: {
            STATUS: 'CALCULATION_MATRIX_ENGAGED',
            TOTAL_TRANSMITTED_WEIGHT: `${normalized.pageWeightMB.toFixed(2)} MB`,
            HOSTING_INFRASTRUCTURE: {
                IS_GREEN_PROVIDER:
                    normalized.isGreenHost === 1 || normalized.isGreenHost === true,
                PROVIDER_SOURCE_CREDIT: 'The Green Web Foundation API',
            },
            RECONSTRUCTED_METRICS: {
                CARBON_EFFICIENCY_SCORE: `${normalized.carbonScore}/100`,
                SUSTAINABILITY_GRADE: grade,
            },
        },
        PHASE_3_SPEED_METRICS_TRANSCRIPT: {
            STATUS: 'TIMING_API_EXTRACTED',
            METRICS: {
                SERVER_RESPONSE_LAG_TTFB: `${normalized.timeToFirstByteMs} ms`,
                DOM_STRUCTURAL_READINESS: `${normalized.domContentLoadedMs} ms`,
                TOTAL_VISUAL_RENDER_TIME: `${normalized.pageLoadTimeMs} ms`,
                ESTIMATED_4G_DOWNLOAD_DELAY: `${normalized.estimated4gLatencyMs} ms`,
            },
        },
        AI_SUSTAINABILITY_OPTIMIZATIONS: performanceAiAdvice,
        SYSTEM_INTEGRITY_NOTICE:
            persistenceStatus === 'STORED'
                ? 'Performance data saved. Full structural audit ready at /analysis/seo-audit'
                : 'Analysis completed, but database persistence failed.',
    };
}

/**
 * 1. FAST PERFORMANCE & CARBON SCAN ROUTE
 * URL: POST /analysis
 */
router.post('/', authenticateToken, async (req, res) => {
    console.log('\n' + '='.repeat(80));
    console.log('🔴 [ANALYSIS-ROUTE] POST /analysis endpoint hit');
    console.log('   User ID:', req.user?.id);
    console.log('   URL:', req.body?.url);
    console.log('='.repeat(80));
    
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "ERR_TARGET_VECTOR_EMPTY" });

    const userId = req.user.id;

    try {
        console.log('analysis route started (Performance Only) for', url);

        // =========================================================================
        // STEP 3 HOOK: Pull both network metrics + speed metrics from service layer
        // =========================================================================
        const [scrapeResult, isGreenHost] = await Promise.all([
            analyzeUrlPerformanceOnly(url),
            checkGreenHosting(url),
        ]);
        const rawData = scrapeResult.networkMetrics || {};
        const speedData = scrapeResult.speedMetrics || {};

        const normalized = await normalizeAnalysisData(url, rawData, speedData, { isGreenHost });
        const metricsPayloadForAi = buildMetricsPayloadForAi(normalized, rawData);

        let persistenceStatus = 'STORED';
        let writeDbReceipt = null;
        const dbStartTime = Date.now();
        try {
            console.log('💾 [DATABASE] Saving analysis record...');
            writeDbReceipt = await saveAnalysisResult(userId, url, {
                pageWeightMB: normalized.pageWeightMB,
                carbonScore: normalized.carbonScore,
                co2EstimateGrams: normalized.co2EstimateGrams,
                isGreenHost: normalized.isGreenHost,
                timeToFirstByteMs: normalized.timeToFirstByteMs,
                domContentLoadedMs: normalized.domContentLoadedMs,
                pageLoadTimeMs: normalized.pageLoadTimeMs,
                estimated4gLatencyMs: normalized.estimated4gLatencyMs,
                seoMetadata: null,
                rawScrapedData: metricsPayloadForAi.rawScrapedData,
            });
            console.log(`✅ [DATABASE] Saved in ${Date.now() - dbStartTime}ms (id: ${writeDbReceipt.insertId})`);
        } catch (dbError) {
            persistenceStatus = 'PERSISTENCE_SKIPPED';
            console.error('❌ [DATABASE] ERROR:', dbError.message);
        }

        const finalResponse = buildPerformanceResponse(url, normalized, metricsPayloadForAi, {
            writeDbReceipt,
            persistenceStatus,
            performanceAiAdvice: [],
        });

        if (writeDbReceipt?.insertId && persistenceStatus === 'STORED') {
            void saveAnalysisPayload(writeDbReceipt.insertId, userId, finalResponse).catch((payloadError) => {
                console.error('Failed to save initial analysis payload:', payloadError.message);
            });
        }

        res.status(200).json(finalResponse);
        return;
    } catch (error) {
        console.error('analysis route failed:', error);
        res.status(500).json({
            SESSION_STATUS: "CRITICAL_VECTOR_FAILURE",
            DIAGNOSTIC_EXCEPTION: error.message
        });
    }
});

/**
 * 2. CORE SEO SUITE & DEEP CRAWLER AUDIT ROUTE
 * URL: POST /analysis/seo-audit
 */
router.post('/seo-audit', authenticateToken, async (req, res) => {
    try {
        const { url, analysis_id } = req.body;
        const userId = req.user.id;

        if (!url || !analysis_id) {
            return res
                .status(400)
                .json({ error: "Missing required parameters: url and analysis_id." });
        }

        console.log(`[SEO Engine] Starting deep crawler suite for Analysis Record ID: ${analysis_id}`);

        const seoAuditData = await analyzeUrlSeoSuite(url);
        const computedSeoAdvice = await fetchSeoAiAdvice(seoAuditData);

        await updateSeoMetadata(analysis_id, userId, seoAuditData);

        const seoResponse = {
            SESSION_STATUS: "SEO_AUDIT_COMPLETED",
            DATABASE_RECORD_ID: Number(analysis_id),
            SEO_METRICS_REPORT: seoAuditData,
            AI_STRUCTURAL_OPTIMIZATIONS: computedSeoAdvice,
        };

        await saveSeoAuditPayload(analysis_id, userId, seoResponse);

        return res.status(200).json(seoResponse);
    } catch (error) {
        console.error('SEO Audit Route Failure:', error);
        res.status(500).json({
            SESSION_STATUS: "SEO_AUDIT_FAILURE",
            DIAGNOSTIC_EXCEPTION: error.message
        });
    }
});

router.get('/history', authenticateToken, async (req, res) => {
    try {
        const history = await getAnalysisHistory(req.user.id, req.query.limit);
        res.json({ history });
    } catch (error) {
        console.error('Analysis history route failed:', error);
        res.status(500).json({ error: 'Failed to load analysis history.' });
    }
});

router.patch('/:id/ai-suggestions', authenticateToken, async (req, res) => {
    try {
        const analysisId = req.params.id;
        const userId = req.user.id;
        const suggestions = req.body?.suggestions;

        if (!Array.isArray(suggestions)) {
            return res.status(400).json({ error: 'suggestions must be an array.' });
        }

        const record = await getAnalysisById(userId, analysisId);
        if (!record?.analysis) {
            return res.status(404).json({ error: 'Analysis not found.' });
        }

        const payload = {
            ...record.analysis,
            AI_SUSTAINABILITY_OPTIMIZATIONS: suggestions,
        };

        await saveAnalysisPayload(analysisId, userId, payload);
        res.json({ success: true, AI_SUSTAINABILITY_OPTIMIZATIONS: suggestions });
    } catch (error) {
        console.error('Save AI suggestions route failed:', error);
        res.status(500).json({ error: 'Failed to save AI suggestions.' });
    }
});

router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const record = await getAnalysisById(req.user.id, req.params.id);

        if (!record) {
            return res.status(404).json({ error: 'Analysis not found.' });
        }

        res.json(record);
    } catch (error) {
        console.error('Analysis detail route failed:', error);
        res.status(500).json({ error: 'Failed to load analysis record.' });
    }
});

module.exports = router;