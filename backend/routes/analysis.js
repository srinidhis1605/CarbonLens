// backend/routes/analysis.js
const express = require('express');
const router = express.Router();
const { analyzeUrl } = require('../services/analysisService');
const { normalizeAnalysisData } = require('../services/normalizationService'); 
const authenticateToken = require('../middleware/authMiddleware');
const { saveAnalysisResult } = require('../services/dbService');
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

router.post('/', authenticateToken, async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "ERR_TARGET_VECTOR_EMPTY" });

    const userId = req.user.id; 

    try {
        console.log('analysis route started for', url);
        
        // --- STEP 1: HARVEST NETWORK CHANNELS ---
        const rawData = await analyzeUrl(url);

        // --- STEP 2: RUN NORMALIZATION & GREEN GRID CHECKS ---
        const normalized = await normalizeAnalysisData(url, rawData);

        // Sanitize secondary micro-asset metrics
        const totalRequests = Math.floor(toSafeNumber(rawData ? rawData.totalRequests : 0));
        const thirdPartyRequests = Math.floor(toSafeNumber(rawData ? rawData.thirdPartyRequests : 0));
        const imageCount = Math.floor(toSafeNumber(rawData ? rawData.imageCount : 0));
        const imageBytes = toSafeNumber(rawData ? rawData.imageBytes : 0);
        const scriptCount = Math.floor(toSafeNumber(rawData ? rawData.scriptCount : 0));
        const scriptBytes = toSafeNumber(rawData ? rawData.scriptBytes : 0);
        const styleCount = Math.floor(toSafeNumber(rawData ? rawData.styleCount : 0));
        const styleBytes = toSafeNumber(rawData ? rawData.styleBytes : 0);
        const fontCount = Math.floor(toSafeNumber(rawData ? rawData.fontCount : 0));
        const fontBytes = toSafeNumber(rawData ? rawData.fontBytes : 0);

        const imagesMB = (imageBytes / (1024 * 1024)).toFixed(2);
        const scriptsMB = (scriptBytes / (1024 * 1024)).toFixed(2);
        const stylesMB = (styleBytes / (1024 * 1024)).toFixed(2);
        const fontsMB = (fontBytes / (1024 * 1024)).toFixed(2);

        const grade = calculateGrade(normalized.carbonScore);

        // Package fully aligned data tracking payload for the DB
        const dbMetrics = {
            pageWeightMB: normalized.pageWeightMB,
            carbonScore: normalized.carbonScore,
            co2EstimateGrams: normalized.co2EstimateGrams,
            isGreenHost: normalized.isGreenHost,
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

        // Persist records down to DB analysis tables
        let persistenceStatus = 'STORED';
        try {
            await saveAnalysisResult(userId, url, dbMetrics);
        } catch (dbError) {
            persistenceStatus = 'PERSISTENCE_SKIPPED';
            console.error('Analysis persistence warning:', dbError.message);
        }

        // --- NEW INTEGRATION: AUTO-FIRE THE AI ADVICE PIPELINE HERE ---
        console.log(`[AI Core] Generating recommendations inside pipeline for: ${url}`);
        let aiAdvice = [];
        try {
            aiAdvice = await fetchAiAdvice(dbMetrics);
        } catch (aiError) {
            console.error("AI Recommendation Generation non-fatal bypass:", aiError.message);
            aiAdvice = [{
                impact: "MEDIUM",
                category: "Caching",
                title: "Optimize Asset Delivery",
                description: "AI generation encountered a momentary error. Please maximize caching layers."
            }];
        }

        // --- STEP 3: OUTPUT PACKAGING ---
        res.json({
            SESSION_STATUS: "TARGET_DECONSTRUCTED_COMPLETED",
            TARGET_HOST: url.replace('https://', '').replace('http://', '').split('/')[0],
            TIMESTAMP_EPOCH: Date.now(),

            PHASE_1_RAW_SOCKET_INTERCEPTION: {
                STATUS: "DATA_HARVEST_SUCCESSFUL",
                DETECTION_LOG: "Bypassed target delivery CDN. Captured raw assets streaming across open HTTP sockets.",
                INTERCEPTED_TRAFFIC: {
                    TOTAL_NETWORK_REQUESTS_LOGGED: totalRequests,
                    FOREIGN_THIRD_PARTY_INJECTIONS: thirdPartyRequests,
                    ROUTING_OVERHEAD_RATIO: totalRequests > 0
                        ? ((thirdPartyRequests / totalRequests) * 100).toFixed(1) + "%"
                        : "0.0%"
                },
                EXTRACTED_PAYLOAD_SIGNATURES: [
                    { CLASSIFICATION: "BINARY_IMAGES",      COUNT: imageCount,  RAW_WEIGHT: `${imagesMB} MB` },
                    { CLASSIFICATION: "CLIENT_JS_SCRIPTS",  COUNT: scriptCount, RAW_WEIGHT: `${scriptsMB} MB` },
                    { CLASSIFICATION: "COMPRESSED_STYLES",  COUNT: styleCount,  RAW_WEIGHT: `${stylesMB} MB` },
                    { CLASSIFICATION: "EMBEDDED_FONTS",     COUNT: fontCount,   RAW_WEIGHT: `${fontsMB} MB` }
                ]
            },

            PHASE_2_ENVIRONMENTAL_RECONSTRUCTION: {
                STATUS: "CALCULATION_MATRIX_ENGAGED",
                ANALYSIS_LOG: "Compiled raw payload signatures through the carbon intensity grid variables.",
                TOTAL_TRANSMITTED_WEIGHT: `${normalized.pageWeightMB.toFixed(2)} MB`,
                HOSTING_INFRASTRUCTURE: normalized.isGreenHost ? "RENEWABLE_ENERGY_GRID (GREEN_HOST)" : "TRADITIONAL_CARBON_GRID (GREY_HOST)",
                RECONSTRUCTED_METRICS: {
                    CARBON_EFFICIENCY_SCORE: `${normalized.carbonScore}/100`,
                    SUSTAINABILITY_GRADE: grade,
                    CO2_EMISSION_PER_VISIT: `${normalized.co2EstimateGrams.toFixed(4)} grams`,
                    ESTIMATED_ANNUAL_CARBON_LOAD: (normalized.co2EstimateGrams * 10000 * 12 / 1000).toFixed(2) + " kg (Based on 10k monthly baseline sessions)"
                }
            },

            // ADDED HERE: Attaching your Gemini recommendations to the final response wrapper
            AI_SUSTAINABILITY_OPTIMIZATIONS: aiAdvice,

            SYSTEM_INTEGRITY_NOTICE: persistenceStatus === 'STORED'
                ? "All security contexts cleared. Extraction data securely locked to database ledger."
                : "Analysis completed, but persistence was skipped due to a database issue."
        });

    } catch (error) {
        console.error('analysis route failed:', error);
        res.status(500).json({ 
            SESSION_STATUS: "CRITICAL_VECTOR_FAILURE", 
            DIAGNOSTIC_EXCEPTION: error && error.message ? error.message : 'Unknown error' 
        });
    }
});

module.exports = router;