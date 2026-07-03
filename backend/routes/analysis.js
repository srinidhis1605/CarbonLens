// backend/routes/analysis.js
const express = require('express');
const router = express.Router();

// 1. Core Service Imports
const { analyzeUrlPerformanceOnly, analyzeUrlSeoSuite } = require('../services/analysisService');
const { normalizeAnalysisData } = require('../services/normalizationService');
const authenticateToken = require('../middleware/authMiddleware');
const { saveAnalysisResult, updateSeoMetadata } = require('../services/dbService');

// =========================================================================
// 🎯 LINK THE DEDICATED HYBRID RECOMMENDATION ENGINES HERE
// =========================================================================
const { fetchAiAdvice } = require('./recommendations'); // Phase 1 Performance
const { fetchSeoAiAdvice } = require('./seoRecommendations'); // Phase 2 SEO

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

        const scrapeResult = await analyzeUrlPerformanceOnly(url);
        const rawData = scrapeResult.networkMetrics || {};
        const normalized = await normalizeAnalysisData(url, rawData);

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

        // =====================================================================
        // 🔥 LINKED: INJECT THE AUTOMATED PERFORMANCE AI PIPELINE
        // =====================================================================
        console.log('\n' + '='.repeat(80));
        console.log('⏱️  [AI STAGE] Performance Analysis AI Pipeline Starting...');
        console.log('='.repeat(80));
        console.log(`📊 Target URL: ${url}`);
        console.log(`📈 Metrics: ${totalRequests} requests, ${imagesMB}MB images, Score: ${normalized.carbonScore}/100`);
        console.log('🤖 Calling AI Service for recommendations...');

        // Prepare data schema format exactly how recommendations.js expects it
        const metricsPayloadForAi = {
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
        fontBytes
    }
};

        let performanceAiAdvice = [];
        const aiStartTime = Date.now();
        try {
            console.log('⏳ Waiting for AI response from Gemini API...');
            performanceAiAdvice = await fetchAiAdvice(metricsPayloadForAi);
            const aiElapsedTime = Date.now() - aiStartTime;
            console.log(`✅ AI Response received successfully in ${aiElapsedTime}ms`);
            console.log(`🎯 Generated ${performanceAiAdvice.length} optimization recommendations`);
            performanceAiAdvice.forEach((rec, idx) => {
                console.log(`   [${idx + 1}] ${rec.impact} - ${rec.category}: ${rec.title}`);
            });
            console.log('='.repeat(80) + '\n');
        } catch (aiError) {
            const aiElapsedTime = Date.now() - aiStartTime;
            console.error(`❌ AI ERROR after ${aiElapsedTime}ms:`, aiError.message);
            console.log('='.repeat(80) + '\n');
            performanceAiAdvice = [
                {
                    impact: "MEDIUM",
                    category: "Scripts",
                    title: "Optimize Asset Bundles",
                    description:
                        "AI extraction encountered a temporary latency block. Compress your core resources."
                }
            ];
        }

        // Persist performance and initial state data to MySQL
        let persistenceStatus = 'STORED';
        let writeDbReceipt = null;
        const dbStartTime = Date.now();
        try {
            console.log('\n' + '='.repeat(80));
            console.log('💾 [DATABASE] Starting analysis persistence to MySQL...');
            writeDbReceipt = await saveAnalysisResult(userId, url, {
                pageWeightMB: normalized.pageWeightMB,
                carbonScore: normalized.carbonScore,
                co2EstimateGrams: normalized.co2EstimateGrams,
                isGreenHost: normalized.isGreenHost,
                seoMetadata: null, // Initialized to null, will be populated via /seo-audit
                rawScrapedData: metricsPayloadForAi.rawScrapedData
            });
            const dbElapsedTime = Date.now() - dbStartTime;
            console.log(`✅ [DATABASE] Analysis record saved successfully in ${dbElapsedTime}ms`);
            console.log(`   - Website ID: ${writeDbReceipt.websiteId}`);
            console.log(`   - Analysis ID: ${writeDbReceipt.insertId}`);
            console.log('='.repeat(80) + '\n');
        } catch (dbError) {
            persistenceStatus = 'PERSISTENCE_SKIPPED';
            const dbElapsedTime = Date.now() - dbStartTime;
            console.log('\n' + '='.repeat(80));
            console.log('DATABASE ERROR CAUGHT:');
            console.error('❌ [DATABASE] ERROR after ' + dbElapsedTime + 'ms:');
            console.error('   - Error Type:', dbError.constructor.name);
            console.error('   - Error Code:', dbError.code);
            console.error('   - Error Message:', dbError.message);
            console.error('   - SQL State:', dbError.sqlState);
            console.error('   - Full Stack:', dbError.stack);
            console.log('='.repeat(80) + '\n');
        }

        // Pack output response map
        const finalResponse = {
            SESSION_STATUS: "PERFORMANCE_ANALYSIS_COMPLETED",
            TARGET_HOST: new URL(url).hostname.replace('www.', ''),
            TIMESTAMP_EPOCH: Date.now(),
            DATABASE_RECORD_ID:
                writeDbReceipt && writeDbReceipt.insertId ? writeDbReceipt.insertId : null,

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
                HOSTING_INFRASTRUCTURE: {
                    IS_GREEN_PROVIDER:
                        normalized.isGreenHost === 1 || normalized.isGreenHost === true,
                    PROVIDER_SOURCE_CREDIT: "The Green Web Foundation API"
                },
                RECONSTRUCTED_METRICS: {
                    CARBON_EFFICIENCY_SCORE: `${normalized.carbonScore}/100`,
                    SUSTAINABILITY_GRADE: grade
                }
            },

            AI_SUSTAINABILITY_OPTIMIZATIONS: performanceAiAdvice,
            SYSTEM_INTEGRITY_NOTICE:
                persistenceStatus === 'STORED'
                    ? "Performance data saved. Full structural audit ready at /analysis/seo-audit"
                    : "Analysis completed, but database persistence failed."
        };

        return res.status(200).json(finalResponse);
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

        if (!url || !analysis_id) {
            return res
                .status(400)
                .json({ error: "Missing required parameters: url and analysis_id." });
        }

        console.log(`[SEO Engine] Starting deep crawler suite for Analysis Record ID: ${analysis_id}`);

        // A. Run heavy multi-page crawler operations
        const seoAuditData = await analyzeUrlSeoSuite(url);

        // =====================================================================
        // 🔥 LINKED: INJECT THE DYNAMIC COMPREHENSIVE HYBRID SEO AI ADVICE
        // =====================================================================
        console.log(`[AI SEO Core] Computing structural insights for record row: ${analysis_id}`);
        const computedSeoAdvice = await fetchSeoAiAdvice(seoAuditData);

        // B. Persist structural data mapping block straight to MySQL table row
        await updateSeoMetadata(analysis_id, seoAuditData);

        return res.status(200).json({
            SESSION_STATUS: "SEO_AUDIT_COMPLETED",
            DATABASE_RECORD_ID: Number(analysis_id),
            SEO_METRICS_REPORT: seoAuditData,
            AI_STRUCTURAL_OPTIMIZATIONS: computedSeoAdvice
        });
    } catch (error) {
        console.error('SEO Audit Route Failure:', error);
        res.status(500).json({
            SESSION_STATUS: "SEO_AUDIT_FAILURE",
            DIAGNOSTIC_EXCEPTION: error.message
        });
    }
});

module.exports = router;