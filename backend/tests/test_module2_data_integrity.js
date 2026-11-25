// backend/tests/test_module2_data_integrity.js
// Tests ALL Module 2 Data Integrity & Edge-Case requirements (Part 3C):
// - Zero-byte website (#9)
// - Missing asset categories (#8 with image_bytes = 0)
// - Missing scan telemetry ({} / null throws MISSING_SCAN_TELEMETRY)
// - 100% reduction boundaries & maximum allowed reduction boundaries
// - Green-hosting-only scenario (energy invariant, intensity 442->312)
// - No optimization selected (throws)
// - Switching between different baseline scans (#8 vs #10)
// - Repeated simulation runs (deterministic idempotency)
// - Invalid user inputs (<0%, >100%, NaN)

const assert = require('assert');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');
require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') });
if (process.env.DB_SSL_CA && !path.isAbsolute(process.env.DB_SSL_CA)) {
    process.env.DB_SSL_CA = path.resolve(backendDir, process.env.DB_SSL_CA);
}

const db = require(path.join(backendDir, 'db'));
const {
    SCENARIO_CATALOG,
    extractBaselineFromAnalysisRow,
    runWhatIfSimulation,
} = require(path.join(backendDir, 'services/simulationService'));

async function main() {
    console.log('=== MODULE 2 DATA INTEGRITY & EDGE-CASE SUITE ===');

    // 1. Missing scan telemetry
    assert.throws(() => extractBaselineFromAnalysisRow(null), /MISSING_SCAN_TELEMETRY/);
    assert.throws(() => extractBaselineFromAnalysisRow({}), /MISSING_SCAN_TELEMETRY/);
    console.log('PASS M2-DI.1: Missing scan telemetry throws MISSING_SCAN_TELEMETRY');

    // Load real MySQL scans #8, #9, #10
    const [rows] = await db.execute(
        `SELECT a.*, w.url FROM analysis a INNER JOIN websites w ON w.id = a.website_id WHERE a.id IN (8, 9, 10) ORDER BY a.id ASC`
    );
    const row8 = rows.find((r) => r.id === 8);
    const row9 = rows.find((r) => r.id === 9);
    const row10 = rows.find((r) => r.id === 10);
    for (const r of [row8, row9, row10]) {
        if (typeof r.analysis_payload === 'string') r.analysis_payload = JSON.parse(r.analysis_payload);
    }

    // 2. Zero-byte website (#9)
    const zeroSim = runWhatIfSimulation(row9, {
        imageOptimization: { enabled: true, compressionPct: 30, webpConversionPct: 30 },
    });
    assert.strictEqual(zeroSim.baseline.totalBytes, 0);
    assert.strictEqual(zeroSim.simulated.totalBytes, 0);
    assert.strictEqual(zeroSim.comparison.pageWeightReductionPct, 0);
    assert.strictEqual(zeroSim.comparison.reconciliationVerified, true);
    console.log('PASS M2-DI.2: Zero-byte scan #9 reconciles with 0 NaN/Infinity');

    // 3. Missing asset category (#8 erp.sathyabama.ac.in has image_bytes=0)
    const noImgSim = runWhatIfSimulation(row8, {
        imageOptimization: { enabled: true, compressionPct: 50, webpConversionPct: 50 },
    });
    assert.strictEqual(noImgSim.baseline.imageBytes, 0);
    assert.strictEqual(noImgSim.comparison.imageBytesSaved, 0);
    assert.strictEqual(noImgSim.comparison.imageReductionPct, 0);
    assert.strictEqual(noImgSim.comparison.reconciliationVerified, true);
    console.log('PASS M2-DI.3: Missing asset category (0 image bytes on #8) yields 0 savings safely');

    // 4. 100% reduction boundary vs maximum allowed reduction boundary
    assert.throws(
        () => runWhatIfSimulation(row10, { imageOptimization: { enabled: true, compressionPct: 100 } }),
        /Out-of-bounds/
    );
    assert.throws(
        () => runWhatIfSimulation(row10, { imageOptimization: { enabled: true, compressionPct: 101 } }),
        /Out-of-range/
    );
    assert.throws(
        () => runWhatIfSimulation(row10, { imageOptimization: { enabled: true, compressionPct: -1 } }),
        /Out-of-range/
    );
    assert.throws(
        () => runWhatIfSimulation(row10, { imageOptimization: { enabled: true, compressionPct: 'abc' } }),
        /Invalid percentage/
    );
    // Exact max boundary for every technique in imageOptimization (capped at maxCombinedReductionPct = 90%)
    const defs = SCENARIO_CATALOG.imageOptimization.techniques;
    const maxImgSim = runWhatIfSimulation(row10, {
        imageOptimization: {
            enabled: true,
            compressionPct: defs.compressionPct.maxPct,
            webpConversionPct: defs.webpConversionPct.maxPct,
            responsiveDeliveryPct: defs.responsiveDeliveryPct.maxPct,
            removeUnusedImagesPct: defs.removeUnusedImagesPct.maxPct,
        },
    });
    assert.strictEqual(maxImgSim.assumptions.imageOptimization.capApplied, true);
    assert.strictEqual(
        maxImgSim.assumptions.imageOptimization.effectiveReductionPct,
        SCENARIO_CATALOG.imageOptimization.maxCombinedReductionPct
    );
    assert.strictEqual(maxImgSim.comparison.reconciliationVerified, true);
    console.log('PASS M2-DI.4: 100%, >100%, <0%, NaN rejected; max allowed slider boundaries cap at 90%');

    // 5. Green-hosting-only scenario
    const greenOnly = runWhatIfSimulation(row10, {}, { simulateGreenHosting: true });
    assert.strictEqual(greenOnly.baseline.energyUsedKWh, greenOnly.simulated.energyUsedKWh);
    assert.strictEqual(greenOnly.baseline.carbonIntensity, 442);
    assert.strictEqual(greenOnly.simulated.carbonIntensity, 312);
    console.log('PASS M2-DI.5: Green-hosting-only scenario preserves energy and updates intensity 442->312');

    // 6. No optimization selected throws
    assert.throws(() => runWhatIfSimulation(row10, {}), /Enable at least one optimization scenario/);
    console.log('PASS M2-DI.6: No scenario selected rejected explicitly');

    // 7. Switching baseline scans (#8 vs #10) & repeated determinism
    const sim8 = runWhatIfSimulation(row8, { javascriptOptimization: { enabled: true, minificationPct: 25 } });
    const sim10a = runWhatIfSimulation(row10, { javascriptOptimization: { enabled: true, minificationPct: 25 } });
    const sim10b = runWhatIfSimulation(row10, { javascriptOptimization: { enabled: true, minificationPct: 25 } });
    assert.notStrictEqual(sim8.baseline.totalBytes, sim10a.baseline.totalBytes);
    assert.strictEqual(sim10a.simulated.totalBytes, sim10b.simulated.totalBytes);
    assert.strictEqual(sim10a.simulated.co2EstimateGramsPrecise, sim10b.simulated.co2EstimateGramsPrecise);
    console.log('PASS M2-DI.7: Switching baselines (#8 vs #10) & repeated deterministic simulations verified');

    await db.end();
}

main().catch(async (err) => {
    console.error('Module 2 Data Integrity test failed:', err);
    try { await db.end(); } catch {}
    process.exit(1);
});
