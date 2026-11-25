// backend/routes/v2Simulations.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const {
    SCENARIO_CATALOG,
    runWhatIfSimulation,
    runScenarioComparisonSuite,
} = require('../services/simulationService');
const {
    getRawAnalysisRow,
    saveSimulation,
    getSimulationsByUser,
    getSimulationById,
} = require('../services/v2DbService');

/**
 * GET /api/v2/simulations/scenarios
 * Returns scenario metadata, default assumptions, and safe bounds.
 */
router.get('/scenarios', authenticateToken, (req, res) => {
    res.json({
        resultType: 'SIMULATED / HYPOTHETICAL RESULTS',
        scenarios: SCENARIO_CATALOG,
    });
});

async function resolveBaseline(userId, body) {
    const { baselineAnalysisId, baselineMetrics } = body || {};
    if (baselineAnalysisId != null) {
        const parsedId = Number(baselineAnalysisId);
        if (!Number.isInteger(parsedId) || parsedId <= 0) {
            const err = new Error('baselineAnalysisId must be a positive integer.');
            err.statusCode = 400;
            throw err;
        }
        const row = await getRawAnalysisRow(userId, parsedId);
        if (!row) {
            const err = new Error('Baseline scan record not found for this user.');
            err.statusCode = 404;
            throw err;
        }
        return row;
    }

    if (baselineMetrics && typeof baselineMetrics === 'object') {
        return baselineMetrics;
    }

    const err = new Error('Provide baselineAnalysisId (existing scan) or baselineMetrics.');
    err.statusCode = 400;
    throw err;
}

/**
 * POST /api/v2/simulations/preview
 * Dynamically computes hypothetical optimization outcomes without saving.
 */
router.post('/preview', authenticateToken, async (req, res) => {
    try {
        const baselineRow = await resolveBaseline(req.user.id, req.body);
        const { scenarioConfig, simulationName, simulateGreenHosting, includeComparisonSuite = false } =
            req.body || {};

        const simulation = runWhatIfSimulation(baselineRow, scenarioConfig, {
            simulationName,
            simulateGreenHosting,
        });

        const suite = includeComparisonSuite
            ? runScenarioComparisonSuite(baselineRow, scenarioConfig, { simulateGreenHosting })
            : null;

        return res.json({
            status: 'OK',
            saved: false,
            simulation,
            comparisonSuite: suite,
        });
    } catch (error) {
        const status = error.statusCode || 400;
        return res.status(status).json({
            error: error.message || 'Simulation calculation failed.',
        });
    }
});

/**
 * POST /api/v2/simulations
 * Computes and persists a What-if simulation to MySQL.
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const baselineRow = await resolveBaseline(req.user.id, req.body);
        const { scenarioConfig, simulationName, simulateGreenHosting, includeComparisonSuite = false } =
            req.body || {};

        const simulation = runWhatIfSimulation(baselineRow, scenarioConfig, {
            simulationName,
            simulateGreenHosting,
        });

        const suite = includeComparisonSuite
            ? runScenarioComparisonSuite(baselineRow, scenarioConfig, { simulateGreenHosting })
            : null;

        let id = null;
        try {
            id = await saveSimulation(req.user.id, simulation);
        } catch (dbErr) {
            console.error('[v2Simulations] Failed to persist simulation:', dbErr.message);
            return res.status(500).json({
                error: 'Simulation computed, but database persistence failed.',
                details: dbErr.message,
                simulation,
            });
        }

        return res.status(201).json({
            status: 'SAVED',
            saved: true,
            simulation: { id, ...simulation },
            comparisonSuite: suite,
        });
    } catch (error) {
        const status = error.statusCode || 400;
        return res.status(status).json({
            error: error.message || 'Simulation creation failed.',
        });
    }
});

/**
 * GET /api/v2/simulations
 * Lists saved What-if simulations for the authenticated user.
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const simulations = await getSimulationsByUser(req.user.id, req.query.limit);
        return res.json({ simulations });
    } catch (error) {
        console.error('[v2Simulations] GET / error:', error);
        return res.status(500).json({ error: 'Failed to load saved simulations.' });
    }
});

/**
 * GET /api/v2/simulations/:id
 * Retrieves a single saved What-if simulation.
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const parsedId = Number(req.params.id);
        if (!Number.isInteger(parsedId) || parsedId <= 0) {
            return res.status(400).json({ error: 'Invalid simulation ID.' });
        }
        const simulation = await getSimulationById(req.user.id, parsedId);
        if (!simulation) {
            return res.status(404).json({ error: 'Simulation not found.' });
        }
        return res.json({ simulation });
    } catch (error) {
        console.error('[v2Simulations] GET /:id error:', error);
        return res.status(500).json({ error: 'Failed to load simulation.' });
    }
});

module.exports = router;
