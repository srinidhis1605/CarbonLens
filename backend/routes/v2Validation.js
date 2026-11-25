// backend/routes/v2Validation.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const {
    runBeforeAfterValidation,
    exportExperimentToCsv,
} = require('../services/validationService');
const {
    saveValidationExperiment,
    getValidationExperimentsByUser,
    getValidationExperimentById,
} = require('../services/v2DbService');

function resolveControlledUrls(req) {
    const configuredBase = process.env.CONTROLLED_SITE_BASE_URL;
    if (configuredBase) {
        const clean = configuredBase.replace(/\/+$/, '');
        return {
            originalUrl: `${clean}/original/`,
            optimizedUrl: `${clean}/optimized/`,
        };
    }
    const port = process.env.PORT || 5000;
    const base = `http://127.0.0.1:${port}/controlled-site`;
    return {
        originalUrl: `${base}/original/`,
        optimizedUrl: `${base}/optimized/`,
    };
}

/**
 * POST /api/v2/validation/run
 * Executes actual repeated Playwright scans on original vs. optimized controlled website.
 */
router.post('/run', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            repetitions = 3,
            experimentName = 'Controlled Website Before-and-After Validation',
            optimizationRunId = null,
        } = req.body || {};

        const safeReps = Number(repetitions);
        if (!Number.isInteger(safeReps) || safeReps < 1 || safeReps > 10) {
            return res.status(400).json({ error: 'repetitions must be an integer between 1 and 10.' });
        }

        const { originalUrl, optimizedUrl } = resolveControlledUrls(req);

        const experiment = await runBeforeAfterValidation({
            originalUrl,
            optimizedUrl,
            repetitions: safeReps,
            experimentName: String(experimentName).slice(0, 180),
            optimizationRunId: optimizationRunId ? Number(optimizationRunId) : null,
            userId,
            persistIndividualToAnalysis: true,
        });

        let experimentId = null;
        try {
            experimentId = await saveValidationExperiment(userId, experiment);
        } catch (dbErr) {
            console.error('[v2Validation] Failed to persist validation experiment:', dbErr.message);
        }

        return res.status(201).json({
            status: 'COMPLETED',
            experiment: {
                id: experimentId,
                ...experiment,
            },
        });
    } catch (error) {
        console.error('[v2Validation] POST /run error:', error);
        return res.status(400).json({
            error: error.message || 'Before-and-After validation experiment failed.',
        });
    }
});

/**
 * GET /api/v2/validation/experiments
 * Lists saved validation experiments for the authenticated user.
 */
router.get('/experiments', authenticateToken, async (req, res) => {
    try {
        const experiments = await getValidationExperimentsByUser(req.user.id, req.query.limit);
        return res.json({ experiments });
    } catch (error) {
        console.error('[v2Validation] GET /experiments error:', error);
        return res.status(500).json({ error: 'Failed to load validation experiments.' });
    }
});

/**
 * GET /api/v2/validation/experiments/:id
 * Retrieves a full validation experiment including all individual repeated scans.
 */
router.get('/experiments/:id', authenticateToken, async (req, res) => {
    try {
        const parsedId = Number(req.params.id);
        if (!Number.isInteger(parsedId) || parsedId <= 0) {
            return res.status(400).json({ error: 'Invalid experiment ID.' });
        }
        const experiment = await getValidationExperimentById(req.user.id, parsedId);
        if (!experiment) {
            return res.status(404).json({ error: 'Validation experiment not found.' });
        }
        return res.json({ experiment });
    } catch (error) {
        console.error('[v2Validation] GET /experiments/:id error:', error);
        return res.status(500).json({ error: 'Failed to load validation experiment.' });
    }
});

/**
 * GET /api/v2/validation/experiments/:id/export?format=csv|json
 * Exports experimental scan records and comparison data in CSV or JSON format.
 */
router.get('/experiments/:id/export', authenticateToken, async (req, res) => {
    try {
        const parsedId = Number(req.params.id);
        if (!Number.isInteger(parsedId) || parsedId <= 0) {
            return res.status(400).json({ error: 'Invalid experiment ID.' });
        }
        const experiment = await getValidationExperimentById(req.user.id, parsedId);
        if (!experiment) {
            return res.status(404).json({ error: 'Validation experiment not found.' });
        }

        const format = String(req.query.format || 'json').toLowerCase();
        if (format === 'csv') {
            const csv = exportExperimentToCsv(experiment);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="carbonlens-validation-exp-${parsedId}.csv"`
            );
            return res.send(csv);
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="carbonlens-validation-exp-${parsedId}.json"`
        );
        return res.send(JSON.stringify(experiment, null, 2));
    } catch (error) {
        console.error('[v2Validation] Export error:', error);
        return res.status(500).json({ error: 'Failed to export validation experiment.' });
    }
});

module.exports = router;
