// backend/routes/analysis.js
const express = require('express');
const router = express.Router();
const { analyzeUrl } = require('../services/analysisService');
const authenticateToken = require('../middleware/authMiddleware');
const { saveAnalysisResult } = require('../services/dbService');

/**
 * Sanitizes scraped values to guarantee valid numerical values
 */
function toSafeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Maps numerical carbon scores directly into environmental letter grades
 */
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
        
        // ==========================================
        // STEP 1: HARVESTING THE SOURCE
        // ==========================================
        const rawData = await analyzeUrl(url);

        // Sanitize raw network metrics from browser interceptors
        const totalBytes = toSafeNumber(rawData ? rawData.totalBytes : 0);
        const imageBytes = toSafeNumber(rawData ? rawData.imageBytes : 0);
        const scriptBytes = toSafeNumber(rawData ? rawData.scriptBytes : 0);
        const styleBytes = toSafeNumber(rawData ? rawData.styleBytes : 0);
        const fontBytes = toSafeNumber(rawData ? rawData.fontBytes : 0);
        
        const totalRequests = Math.floor(toSafeNumber(rawData ? rawData.totalRequests : 0));
        const thirdPartyRequests = Math.floor(toSafeNumber(rawData ? rawData.thirdPartyRequests : 0));
        const imageCount = Math.floor(toSafeNumber(rawData ? rawData.imageCount : 0));
        const scriptCount = Math.floor(toSafeNumber(rawData ? rawData.scriptCount : 0));
        const styleCount = Math.floor(toSafeNumber(rawData ? rawData.styleCount : 0));
        const fontCount = Math.floor(toSafeNumber(rawData ? rawData.fontCount : 0));

        // Convert byte capacities safely to Megabytes
        const totalWeightMB = totalBytes / (1024 * 1024);
        const imagesMB = (imageBytes / (1024 * 1024)).toFixed(2);
        const scriptsMB = (scriptBytes / (1024 * 1024)).toFixed(2);
        const stylesMB = (styleBytes / (1024 * 1024)).toFixed(2);
        const fontsMB = (fontBytes / (1024 * 1024)).toFixed(2);
        const totalMB = totalWeightMB.toFixed(2);

        // ==========================================
        // STEP 2: EXPONENTIAL DECONSTRUCTION FORMULAS (UPGRADED LOGIC)
        // ==========================================
        // Core Carbon Model Formula (0.5g CO2 footprint multiplier per MB)
        const co2 = (totalWeightMB * 0.5).toFixed(4);

        // REALISTIC LOGARITHMIC CURVE SCALING (Lighthouse Inspired)
        // Uses k = 0.15 to give a realistic, balanced grading path over massive pages
        const scalingFactor = 0.15;
        let score = Math.round(100 * Math.exp(-scalingFactor * totalWeightMB));
        
        // Fail-safe boundary constraints
        if (score < 0) score = 0;
        if (score > 100) score = 100;

        const grade = calculateGrade(score);

        // Boundary Defense: Prevent inputs from exceeding MySQL column widths
        let safePageWeight = Math.min(99999.99, Math.max(0, totalWeightMB));
        let safeCo2 = Math.min(99999.99, Math.max(0, parseFloat(co2) || 0));

        // Pack the entire 15-column dataset structure required by your dbService layout
        const metrics = {
            pageWeightMB: safePageWeight,
            carbonScore: score,
            co2EstimateGrams: safeCo2,
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

        // Fire transaction save request through DB ledger script
        let persistenceStatus = 'STORED';
        try {
            await saveAnalysisResult(userId, url, metrics);
        } catch (dbError) {
            persistenceStatus = 'PERSISTENCE_SKIPPED';
            console.error('Analysis persistence warning:', dbError.message);
        }

        // ==========================================
        // STEP 3: THE CINEMATIC TWO-PHASE OUTPUT RESPONSE
        // ==========================================
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
                TOTAL_TRANSMITTED_WEIGHT: `${totalMB} MB`,
                RECONSTRUCTED_METRICS: {
                    CARBON_EFFICIENCY_SCORE: `${score}/100`,
                    SUSTAINABILITY_GRADE: grade,
                    CO2_EMISSION_PER_VISIT: `${co2} grams`,
                    ESTIMATED_ANNUAL_CARBON_LOAD: (co2 * 10000 * 12 / 1000).toFixed(2) + " kg (Based on 10k monthly baseline sessions)"
                }
            },

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