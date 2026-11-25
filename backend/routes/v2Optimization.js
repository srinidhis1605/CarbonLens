// backend/routes/v2Optimization.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const {
    getControlledSiteStatus,
    runControlledOptimization,
    measureControlledSitesInBrowser,
} = require('../services/optimizationService');
const {
    saveOptimizationRun,
    getOptimizationRunsByUser,
    getOptimizationRunById,
} = require('../services/v2DbService');

/**
 * GET /api/v2/optimization/site-status
 * Inspects the controlled test website (original & optimized file inventories and sizes).
 */
router.get('/site-status', authenticateToken, async (req, res) => {
    try {
        const status = await getControlledSiteStatus();
        return res.json({ status: 'OK', site: status });
    } catch (error) {
        console.error('[v2Optimization] GET /site-status error:', error);
        return res.status(500).json({
            error: 'Failed to inspect controlled test website.',
            details: error.message,
        });
    }
});

/**
 * POST /api/v2/optimization/run
 * Executes actual file-level optimizations (images/JS/CSS) on the controlled test website.
 * Always persists COMPLETED, PARTIAL_SUCCESS, and FAILED runs to MySQL so errors are never hidden.
 */
router.post('/run', authenticateToken, async (req, res) => {
    const {
        images = true,
        javascript = true,
        css = true,
        imageQuality = 75,
        maxImageWidth = 1200,
        removeUnusedAssets = true,
    } = req.body || {};

    const selectedOperations = {
        images: Boolean(images),
        javascript: Boolean(javascript),
        css: Boolean(css),
        imageQuality: Number(imageQuality),
        maxImageWidth: Number(maxImageWidth),
        removeUnusedAssets: Boolean(removeUnusedAssets),
    };

    if (!selectedOperations.images && !selectedOperations.javascript && !selectedOperations.css) {
        return res.status(400).json({
            error: 'Select at least one optimization category (images, javascript, or css).',
        });
    }

    try {
        const result = await runControlledOptimization(selectedOperations);

        let runId = null;
        try {
            runId = await saveOptimizationRun(req.user.id, result);
        } catch (dbErr) {
            console.error('[v2Optimization] Failed to persist optimization run:', dbErr.message);
        }

        const httpStatus = result.status === 'FAILED' ? 500 : 200;
        return res.status(httpStatus).json({
            status: result.status,
            error:
                result.status === 'FAILED'
                    ? result.errors?.[0]?.message || 'Optimization execution failed.'
                    : undefined,
            run: {
                id: runId,
                ...result,
            },
        });
    } catch (error) {
        console.error('[v2Optimization] POST /run error:', error);
        const failedRun = {
            siteName: 'controlled-test-website',
            status: 'FAILED',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            selectedOperations,
            summary: {
                resultType: 'ACTUAL_OPTIMIZATION_RESULT',
                originalPreserved: true,
                operationsCount: 0,
                succeededCount: 0,
                failedCount: 1,
            },
            operations: [],
            errors: [{ category: 'system', file: 'optimizationService', message: error.message }],
        };

        let runId = null;
        try {
            runId = await saveOptimizationRun(req.user.id, failedRun);
        } catch (dbErr) {
            console.error('[v2Optimization] Failed to persist failed run:', dbErr.message);
        }

        return res.status(500).json({
            status: 'FAILED',
            error: error.message || 'Optimization execution failed.',
            run: { id: runId, ...failedRun },
        });
    }
});

/**
 * POST /api/v2/optimization/measure-browser
 * Runs live Playwright browser measurements on /controlled-site/original/ and /optimized/
 * and separates browser-transferred telemetry (MEASURED) from CarbonLens formulas (CALCULATED).
 */
router.post('/measure-browser', authenticateToken, async (req, res) => {
    try {
        const port = process.env.PORT || 5000;
        const base = (process.env.CONTROLLED_SITE_BASE_URL || `http://127.0.0.1:${port}/controlled-site`).replace(
            /\/+$/,
            ''
        );
        const measurements = await measureControlledSitesInBrowser({
            originalUrl: `${base}/original/`,
            optimizedUrl: `${base}/optimized/`,
        });
        return res.json({ status: 'OK', measurements });
    } catch (error) {
        console.error('[v2Optimization] POST /measure-browser error:', error);
        return res.status(500).json({
            error: 'Browser measurement failed.',
            details: error.message,
        });
    }
});

/**
 * GET /api/v2/optimization/runs
 * Lists past actual optimization runs for the authenticated user.
 */
router.get('/runs', authenticateToken, async (req, res) => {
    try {
        const runs = await getOptimizationRunsByUser(req.user.id, req.query.limit);
        return res.json({ runs });
    } catch (error) {
        console.error('[v2Optimization] GET /runs error:', error);
        return res.status(500).json({ error: 'Failed to load optimization runs.' });
    }
});

/**
 * GET /api/v2/optimization/runs/:id
 * Retrieves detailed log of a single optimization run.
 */
router.get('/runs/:id', authenticateToken, async (req, res) => {
    try {
        const parsedId = Number(req.params.id);
        if (!Number.isInteger(parsedId) || parsedId <= 0) {
            return res.status(400).json({ error: 'Invalid optimization run ID.' });
        }
        const run = await getOptimizationRunById(req.user.id, parsedId);
        if (!run) {
            return res.status(404).json({ error: 'Optimization run not found.' });
        }
        return res.json({ run });
    } catch (error) {
        console.error('[v2Optimization] GET /runs/:id error:', error);
        return res.status(500).json({ error: 'Failed to load optimization run.' });
    }
});

module.exports = router;
