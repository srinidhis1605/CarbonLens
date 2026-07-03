// backend/routes/analysis.js
const express = require('express');
const router = express.Router();

// IMPORT THE NEW SPLIT METHODS
const { analyzeUrlPerformanceOnly, analyzeUrlSeoSuite } = require('../services/analysisService');
const { normalizeAnalysisData } = require('../services/normalizationService');
const authenticateToken = require('../middleware/authMiddleware');
const { saveAnalysisResult, updateSeoMetadata } = require('../services/dbService');
const { fetchAiAdvice } = require('./recommendations');

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

/**
 * 1. FAST PERFORMANCE & CARBON SCAN ROUTE
 * URL: POST /analysis
 */
router.post('/', authenticateToken, async (req, res) => {
    const { url, website_id } = req.body;
    if (!url) return res.status(400).json({ error: "ERR_TARGET_VECTOR_EMPTY" });

    const userId = req.user.id;

    try {
        console.log('analysis route started (Performance Only) for', url);

        // --- STEP 1: HARVEST NETWORK CHANNELS (Lightning Fast Single Page Fetch) ---
        const scrapeResult = await analyzeUrlPerformanceOnly(url);
        const rawData = scrapeResult.networkMetrics || {};

        // --- STEP 2: RUN NORMALIZATION & GREEN GRID CHECKS ---
        const normalized = await normalizeAnalysisData(url, rawData);

        // Sanitize secondary micro-asset metrics
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

        const imagesMB = (imageBytes / (1024 * 1024)).toFixed(2);
        const scriptsMB = (scriptBytes / (1024 * 1024)).toFixed(2);
        const stylesMB = (styleBytes / (1024 * 1024)).toFixed(2);
        const fontsMB = (fontBytes / (1024 * 1024)).toFixed(2);

        const grade = calculateGrade(normalized.carbonScore);

        // Persist performance metrics down to DB analysis tables
        let persistenceStatus = 'STORED';
        let writeDbReceipt = null;
        try {
            writeDbReceipt = await saveAnalysisResult(userId, url, {
                pageWeightMB: normalized.pageWeightMB,
                carbonScore: normalized.carbonScore,
                co2EstimateGrams: normalized.co2EstimateGrams,
                isGreenHost: normalized.isGreenHost,
                seoMetadata: null, // Initialized to null, will be updated by /seo-audit
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
                    fontBytes
                }
            });
        } catch (dbError) {
            persistenceStatus = 'PERSISTENCE_SKIPPED';
            console.error('Analysis persistence warning:', dbError.message);
        }

        // --- STEP 3: AUTO-FIRE THE AI ADVICE PIPELINE ---
        console.log(`[AI Core] Generating recommendations inside pipeline for: ${url}`);
        let aiAdvice = [];
        try {
            aiAdvice = await fetchAiAdvice(scrapeResult);
        } catch (aiError) {
            console.error("AI Recommendation Generation non-fatal bypass:", aiError.message);
            aiAdvice = [{
                impact: "MEDIUM",
                category: "Caching",
                title: "Optimize Asset Delivery",
                description: "AI generation encountered a momentary error. Please maximize caching layers."
            }];
        }

        // --- STEP 4: OUTPUT PACKAGING ---
        const finalResponse = {
            SESSION_STATUS: "PERFORMANCE_ANALYSIS_COMPLETED",
            TARGET_HOST: new URL(url).hostname.replace('www.', ''),
            TIMESTAMP_EPOCH: Date.now(),
            DATABASE_RECORD_ID: writeDbReceipt && writeDbReceipt.insertId ? writeDbReceipt.insertId : null,

            PHASE_1_RAW_SOCKET_INTERCEPTION: {
                STATUS: "DATA_HARVEST_SUCCESSFUL",
                INTERCEPTED_TRAFFIC: {
                    TOTAL_NETWORK_REQUESTS_LOGGED: totalRequests,
                    FOREIGN_THIRD_PARTY_INJECTIONS: thirdPartyRequests
                },
                EXTRACTED_PAYLOAD_SIGNATURES: [
                    { CLASSIFICATION: "BINARY_IMAGES", COUNT: imageCount, RAW_WEIGHT: `${imagesMB} MB` },
                    { CLASSIFICATION: "CLIENT_JS_SCRIPTS", COUNT: scriptCount, RAW_WEIGHT: `${scriptsMB} MB` },
                    { CLASSIFICATION: "COMPRESSED_STYLES", COUNT: styleCount, RAW_WEIGHT: `${stylesMB} MB` },
                    { CLASSIFICATION: "EMBEDDED_FONTS", COUNT: fontCount, RAW_WEIGHT: `${fontsMB} MB` }
                ]
            },

            PHASE_2_ENVIRONMENTAL_RECONSTRUCTION: {
                STATUS: "CALCULATION_MATRIX_ENGAGED",
                TOTAL_TRANSMITTED_WEIGHT: `${normalized.pageWeightMB.toFixed(2)} MB`,
                // ========================================================
                // GREEN HOSTING API STATUS RESTORED HERE:
                // ========================================================
                HOSTING_INFRASTRUCTURE: {
                    IS_GREEN_PROVIDER: normalized.isGreenHost === 1 || normalized.isGreenHost === true,
                    PROVIDER_SOURCE_CREDIT: "The Green Web Foundation API"
                },
                RECONSTRUCTED_METRICS: {
                    CARBON_EFFICIENCY_SCORE: `${normalized.carbonScore}/100`,
                    SUSTAINABILITY_GRADE: grade
                }
            },

            AI_SUSTAINABILITY_OPTIMIZATIONS: aiAdvice,
            SYSTEM_INTEGRITY_NOTICE: persistenceStatus === 'STORED'
                ? "Performance data saved. Full structural audit ready at /analysis/seo-audit"
                : "Analysis completed, but database persistence failed."
        };

        return res.status(200).json(finalResponse);
    } catch (error) {
        console.error('analysis route failed:', error);
        res.status(500).json({
            SESSION_STATUS: "CRITICAL_VECTOR_FAILURE",
            DIAGNOSTIC_EXCEPTION: error && error.message ? error.message : 'Unknown error'
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

        if (!url || !analysis_id) {
            return res.status(400).json({ error: "Missing required parameters: url and analysis_id." });
        }

        console.log(`[SEO Engine] Starting deep crawler suite for Analysis Record ID: ${analysis_id}`);

        // Run the heavy multi-page spider and crawler lookups (All Phase 2 logic)
        const seoAuditData = await analyzeUrlSeoSuite(url);

        // Update the existing row's seo_metadata column in the database
        await updateSeoMetadata(analysis_id, seoAuditData);

        return res.status(200).json({
            SESSION_STATUS: "SEO_AUDIT_COMPLETED",
            DATABASE_RECORD_ID: Number(analysis_id),
            SEO_METRICS_REPORT: seoAuditData
        });
    } catch (error) {
        console.error('SEO Audit Route Failure:', error);
        res.status(500).json({
            SESSION_STATUS: "SEO_AUDIT_FAILURE",
            DIAGNOSTIC_EXCEPTION: error && error.message ? error.message : 'Unknown error'
        });
    }
});

module.exports = router;