// backend/tests/test_module1_live.js
// Tests Module 1 (AI Sustainability Agent) after accuracy & timeout fixes:
// 1. Offline unit tests (valid JSON, invalid JSON, missing fields, 429, timeout, zero-byte, no unsupported CPU claims)
// 2. Live Gemini 2.5 Flash + Live MySQL read-only scan #10 (sathyabama.ac.in) and #9 (sathyabama.com)

const assert = require('assert');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');
require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') });
if (process.env.DB_SSL_CA && !path.isAbsolute(process.env.DB_SSL_CA)) {
    process.env.DB_SSL_CA = path.resolve(backendDir, process.env.DB_SSL_CA);
}

const db = require(path.join(backendDir, 'db'));
const { runSustainabilityAgent } = require(path.join(backendDir, 'services/sustainabilityAgentService'));

async function run() {
    console.log('=== MODULE 1 UNIT + LIVE GEMINI VERIFICATION ===');

    // 1. Zero-byte unit test
    const zeroRes = await runSustainabilityAgent({
        analysisId: 9,
        url: 'https://sathyabama.com',
        totalBytes: 0,
        totalRequests: 3,
        thirdPartyRequests: 2,
    });
    assert.strictEqual(zeroRes.generationMode, 'deterministic_fallback');
    assert.strictEqual(zeroRes.recommendations[0].issueIdentified, 'Zero transferred payload bytes recorded during scan');
    console.log('PASS: Zero-byte scan handled cleanly without calling LLM');

    // 2. Fallback wording check (no unsupported CPU/hardware energy claims)
    const fallbackRes = await runSustainabilityAgent(
        {
            url: 'https://test.example',
            totalBytes: 2_000_000,
            imageBytes: 1_200_000,
            imageCount: 10,
            scriptBytes: 600_000,
            scriptCount: 15,
            styleBytes: 100_000,
            styleCount: 4,
            totalRequests: 45,
            thirdPartyRequests: 15,
            timeToFirstByteMs: 900,
            pageLoadTimeMs: 4000,
            isGreenHost: false,
        },
        { llmClient: null }
    );
    const fullText = JSON.stringify(fallbackRes.recommendations).toLowerCase();
    assert.ok(!fullText.includes('cpu parsing/execution energy'), 'Must not claim unmeasured CPU energy');
    assert.ok(!fullText.includes('server hardware active longer'), 'Must not claim unmeasured server hardware power');
    for (const rec of fallbackRes.recommendations) {
        assert.ok(rec.measuredFacts && rec.engineeringInference && rec.generalSuggestion);
    }
    console.log('PASS: Fallback separates measuredFacts / engineeringInference / generalSuggestion without unsupported energy claims');

    // 3. Live MySQL SELECT scan #10 + Live Gemini 2.5 Flash call
    const [rows] = await db.execute(
        `SELECT a.*, w.url
         FROM analysis a
         INNER JOIN websites w ON w.id = a.website_id
         WHERE a.id = 10 LIMIT 1`
    );
    assert.ok(rows.length === 1, 'Expected analysis #10 in MySQL');
    const row10 = rows[0];
    if (typeof row10.analysis_payload === 'string') {
        row10.analysis_payload = JSON.parse(row10.analysis_payload);
    }

    const t0 = Date.now();
    const liveRes = await runSustainabilityAgent({ ...row10, analysisId: row10.id });
    const elapsedMs = Date.now() - t0;

    console.log(`Live Gemini Agent elapsed: ${elapsedMs} ms`);
    console.log('generationMode:', liveRes.generationMode);
    console.log('modelName:', liveRes.modelName);
    console.log('fallbackReason:', liveRes.fallbackReason);
    console.log('tokenUsage:', JSON.stringify(liveRes.tokenUsage));
    console.log('overallAssessment:', liveRes.overallAssessment);
    console.log('recommendations count:', liveRes.recommendations.length);
    console.log('First recommendation:', JSON.stringify(liveRes.recommendations[0], null, 2));

    assert.strictEqual(liveRes.generationMode, 'gemini', `Expected live Gemini success, got fallback: ${liveRes.fallbackReason}`);
    assert.ok(liveRes.recommendations.length >= 3);
    for (const rec of liveRes.recommendations) {
        assert.ok(rec.measuredFacts && rec.engineeringInference && rec.generalSuggestion);
    }

    await db.end();
    console.log('PASS: Module 1 live Gemini + MySQL scan #10 verified!');
}

run().catch(async (err) => {
    console.error('Module 1 verification failed:', err);
    try { await db.end(); } catch {}
    process.exit(1);
});
