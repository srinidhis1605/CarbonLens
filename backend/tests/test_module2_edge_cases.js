// backend/tests/test_module2_edge_cases.js
// Tests Module 2 (What-if Simulator) formulas, edge cases, and Module 1 <-> Module 2 cross-module parity
// using real persisted MySQL scan records (#10 sathyabama.ac.in, #9 sathyabama.com).

const assert = require('assert');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');
require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') });
if (process.env.DB_SSL_CA && !path.isAbsolute(process.env.DB_SSL_CA)) {
    process.env.DB_SSL_CA = path.resolve(backendDir, process.env.DB_SSL_CA);
}

const db = require(path.join(backendDir, 'db'));
const { buildStructuredScanInput } = require(path.join(backendDir, 'services/sustainabilityAgentService'));
const {
    extractBaselineFromAnalysisRow,
    runWhatIfSimulation,
    runScenarioComparisonSuite,
} = require(path.join(backendDir, 'services/simulationService'));

async function run() {
    console.log('=== MODULE 2 EDGE-CASE & CROSS-MODULE PARITY TESTS ===');

    const [rows] = await db.execute(
        `SELECT a.*, w.url
         FROM analysis a
         INNER JOIN websites w ON w.id = a.website_id
         WHERE a.id IN (9, 10)
         ORDER BY a.id ASC`
    );
    const row9 = rows.find((r) => r.id === 9);
    const row10 = rows.find((r) => r.id === 10);
    assert.ok(row9 && row10, 'Expected MySQL analysis records #9 and #10');

    // 1. Cross-module parity on record #10 (sathyabama.ac.in)
    const m1Scan = buildStructuredScanInput({ ...row10, analysisId: row10.id });
    const m2Base = extractBaselineFromAnalysisRow(row10);
    assert.strictEqual(m1Scan.totalBytes, m2Base.totalBytes, 'M1 vs M2 totalBytes mismatch');
    assert.strictEqual(m1Scan.otherBytes, m2Base.otherBytes, 'M1 vs M2 otherBytes mismatch');
    assert.strictEqual(m1Scan.energyEstimateKWh, m2Base.energyUsedKWh, 'M1 vs M2 energy mismatch');
    assert.strictEqual(m1Scan.co2EstimateGrams, m2Base.co2EstimateGrams, 'M1 vs M2 co2 mismatch');
    assert.strictEqual(m1Scan.carbonScore, m2Base.carbonScore, 'M1 vs M2 score mismatch');
    assert.strictEqual(m2Base.totalBytes, row10.image_bytes + row10.script_bytes + row10.style_bytes + row10.font_bytes);
    console.log(`PASS: M1 <-> M2 exact parity on #10 (${row10.url}): ${m2Base.totalBytes} B, ${m2Base.energyUsedKWh} kWh, ${m2Base.co2EstimateGrams} g, score ${m2Base.carbonScore}`);

    // 2. Green-hosting-only scenario (changes carbonIntensity & CO2, NEVER energyUsedKWh)
    const greenOnly = runWhatIfSimulation(row10, {}, { simulateGreenHosting: true });
    assert.strictEqual(greenOnly.baseline.energyUsedKWh, greenOnly.simulated.energyUsedKWh, 'Green hosting must NOT alter energyUsedKWh');
    assert.strictEqual(greenOnly.comparison.energySavedKWh, 0);
    assert.strictEqual(greenOnly.comparison.energyReductionPct, 0);
    assert.strictEqual(greenOnly.baseline.carbonIntensity, 442);
    assert.strictEqual(greenOnly.simulated.carbonIntensity, 312);
    assert.ok(greenOnly.simulated.co2EstimateGramsPrecise < greenOnly.baseline.co2EstimateGramsPrecise);
    assert.strictEqual(greenOnly.simulated.carbonScore, greenOnly.baseline.carbonScore);
    console.log(`PASS: Green-hosting-only preserves energy (${greenOnly.simulated.energyUsedKWh} kWh) while lowering CO2 (${greenOnly.baseline.co2EstimateGrams} -> ${greenOnly.simulated.co2EstimateGrams} g, -${greenOnly.comparison.co2ReductionPct}%)`);

    // 3. Zero-byte scan edge case (#9 sathyabama.com)
    const zeroSim = runWhatIfSimulation(row9, {
        imageOptimization: { enabled: true, compressionPct: 30, webpConversionPct: 30 },
        resourceRequestOptimization: { enabled: true, httpRequestReductionPct: 33, thirdPartyReductionPct: 50 },
    });
    assert.strictEqual(zeroSim.baseline.totalBytes, 0);
    assert.strictEqual(zeroSim.simulated.totalBytes, 0);
    assert.strictEqual(zeroSim.comparison.bytesSaved, 0);
    assert.strictEqual(zeroSim.comparison.pageWeightReductionPct, 0);
    assert.strictEqual(zeroSim.comparison.reconciliationVerified, true);
    assert.ok(zeroSim.simulated.totalRequests >= 1);
    console.log('PASS: Zero-byte real DB record #9 handled cleanly without NaN/Infinity/negative values');

    // 4. Individual scenarios A, B, C, D + Combined + Green Hosting suite on #10
    const suite = runScenarioComparisonSuite(row10, {}, { simulateGreenHosting: true });
    assert.strictEqual(suite.combined.simulated.isGreenHost, true);
    assert.strictEqual(suite.individual.imageOptimization.simulated.isGreenHost, true);
    assert.strictEqual(suite.combined.comparison.reconciliationVerified, true);
    assert.ok(suite.combined.comparison.bytesSaved > suite.individual.imageOptimization.comparison.bytesSaved);
    console.log(`PASS: Comparison suite with green hosting passed (Combined saved ${suite.combined.comparison.bytesSaved} B, -${suite.combined.comparison.pageWeightReductionPct}% weight, -${suite.combined.comparison.co2ReductionPct}% CO2)`);

    await db.end();
}

run().catch(async (err) => {
    console.error('Module 2 test failed:', err);
    try { await db.end(); } catch {}
    process.exit(1);
});
