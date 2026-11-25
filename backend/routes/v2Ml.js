// backend/routes/v2Ml.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const {
    getModelStatus,
    extractFeaturesFromScan,
    predictWithCatBoost,
} = require('../services/catboostService');
const { getRawAnalysisRow } = require('../services/v2DbService');

/**
 * GET /api/v2/ml/status
 * Reports truthful CatBoost development status (TRAINING_PENDING) and schema.
 */
router.get('/status', authenticateToken, (req, res) => {
    return res.json(getModelStatus());
});

/**
 * POST /api/v2/ml/extract-features
 * Extracts the real ML feature vector from an existing saved scan (`analysisId`).
 */
router.post('/extract-features', authenticateToken, async (req, res) => {
    try {
        const analysisId = Number(req.body?.analysisId);
        if (!Number.isInteger(analysisId) || analysisId <= 0) {
            return res.status(400).json({ error: 'analysisId must be a positive integer.' });
        }
        const row = await getRawAnalysisRow(req.user.id, analysisId);
        if (!row) {
            return res.status(404).json({ error: 'Analysis record not found for this user.' });
        }
        const features = extractFeaturesFromScan(row);
        return res.json({
            status: 'FEATURES_EXTRACTED',
            modelStatus: 'TRAINING_PENDING',
            analysisId,
            targetUrl: row.url,
            features,
        });
    } catch (error) {
        console.error('[v2Ml] /extract-features error:', error);
        return res.status(500).json({ error: 'Feature extraction failed.' });
    }
});

/**
 * POST /api/v2/ml/predict
 * Explicitly returns 503 MODEL_NOT_TRAINED until a genuine trained CatBoost model exists.
 */
router.post('/predict', authenticateToken, async (req, res) => {
    try {
        await predictWithCatBoost(req.body);
    } catch (error) {
        return res.status(error.statusCode || 503).json({
            status: error.code || 'MODEL_NOT_TRAINED',
            banner: 'CatBoost Model — Training and Evaluation Pending',
            message: error.message,
        });
    }
});

module.exports = router;
