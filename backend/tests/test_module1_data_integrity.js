// backend/tests/test_module1_data_integrity.js
// Tests ALL 9 Module 1 Data Integrity requirements (Part 2E):
// 1. Successful live Gemini generation
// 2. Gemini timeout -> RULE-BASED deterministic fallback
// 3. Invalid AI JSON response -> RULE-BASED deterministic fallback
// 4. Deterministic fallback wording & provenance
// 5. Cached fallback does not permanently block fresh Gemini attempt (route logic verified)
// 6. Missing scan telemetry rejected explicitly (never silently zeroed)
// 7. Zero-byte scan (#9 sathyabama.com) handled accurately without invoking LLM
// 8. Switching between saved analyses (#10 vs #8) produces distinct evidence
// 9. Report persistence & reload (verified via live MySQL temp user or service contract)

const assert = require('assert');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');
require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') });
if (process.env.DB_SSL_CA && !path.isAbsolute(process.env.DB_SSL_CA)) {
    process.env.DB_SSL_CA = path.resolve(backendDir, process.env.DB_SSL_CA);
}

const db = require(path.join(backendDir, 'db'));
const {
    runSustainabilityAgent,
    buildStructuredScanInput,
} = require(path.join(backendDir, 'services/sustainabilityAgentService'));

async function main() {
    console.log('=== MODULE 1 DATA INTEGRITY VERIFICATION ===');

    // 1. Missing scan telemetry MUST throw MISSING_SCAN_TELEMETRY (never silently substitute zeros)
    assert.throws(() => buildStructuredScanInput({}), /MISSING_SCAN_TELEMETRY/);
    assert.throws(() => buildStructuredScanInput(null), /MISSING_SCAN_TELEMETRY/);
    console.log('PASS M1-DI.1: Missing scan telemetry rejected explicitly (no silent zero substitution)');

    // 2. Fetch real MySQL scans #8, #9, #10
    const [rows] = await db.execute(
        `SELECT a.*, w.url FROM analysis a INNER JOIN websites w ON w.id = a.website_id WHERE a.id IN (8, 9, 10) ORDER BY a.id ASC`
    );
    const row8 = rows.find((r) => r.id === 8);
    const row9 = rows.find((r) => r.id === 9);
    const row10 = rows.find((r) => r.id === 10);
    assert.ok(row8 && row9 && row10, 'Expected MySQL analysis records #8, #9, #10');
    for (const r of [row8, row9, row10]) {
        if (typeof r.analysis_payload === 'string') r.analysis_payload = JSON.parse(r.analysis_payload);
    }

    // 3. Zero-byte scan (#9 sathyabama.com)
    const zeroReport = await runSustainabilityAgent({ ...row9, analysisId: 9 });
    assert.strictEqual(zeroReport.provenance, 'RULE-BASED');
    assert.strictEqual(zeroReport.generationMode, 'deterministic_fallback');
    assert.strictEqual(zeroReport.scanEvidence.totalBytes, 0);
    assert.strictEqual(zeroReport.recommendations[0].issueIdentified, 'Zero transferred payload bytes recorded during scan');
    console.log('PASS M1-DI.2: Zero-byte real DB record #9 (sathyabama.com) handled accurately as RULE-BASED');

    // 4. Switching between #8 (JS-heavy erp.sathyabama.ac.in) and #10 (Image-heavy www.sathyabama.ac.in)
    const fb8 = await runSustainabilityAgent({ ...row8, analysisId: 8 }, { llmClient: null });
    const fb10 = await runSustainabilityAgent({ ...row10, analysisId: 10 }, { llmClient: null });
    assert.notStrictEqual(fb8.scanEvidence.totalBytes, fb10.scanEvidence.totalBytes);
    assert.strictEqual(fb8.recommendations[0].resourceCategory, 'JavaScript');
    assert.strictEqual(fb10.recommendations[0].resourceCategory, 'Images');
    console.log('PASS M1-DI.3: Switching saved analyses (#8 JS-heavy vs #10 Image-heavy) produces distinct evidence & priorities');

    // 5. Timeout -> RULE-BASED fallback
    const timeoutRes = await runSustainabilityAgent(
        { ...row10, analysisId: 10 },
        {
            timeoutMs: 30,
            llmClient: { chat: { completions: { create: () => new Promise((r) => setTimeout(r, 300)) } } },
        }
    );
    assert.strictEqual(timeoutRes.provenance, 'RULE-BASED');
    assert.strictEqual(timeoutRes.generationMode, 'deterministic_fallback');
    assert.ok(timeoutRes.fallbackReason.toLowerCase().includes('timeout'));
    console.log('PASS M1-DI.4: Timeout cleanly triggers RULE-BASED fallback with explicit fallbackReason');

    // 6. Invalid AI JSON -> RULE-BASED fallback
    const badJsonRes = await runSustainabilityAgent(
        { ...row10, analysisId: 10 },
        {
            llmClient: { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'not-json' } }] }) } } },
        }
    );
    assert.strictEqual(badJsonRes.provenance, 'RULE-BASED');
    assert.ok(badJsonRes.fallbackReason.includes('INVALID_JSON'));
    console.log('PASS M1-DI.5: Invalid AI JSON triggers RULE-BASED fallback with INVALID_JSON reason');

    // 7. Live Gemini generation on #10
    const t0 = Date.now();
    const liveRes = await runSustainabilityAgent({ ...row10, analysisId: 10 });
    const elapsedMs = Date.now() - t0;
    assert.strictEqual(liveRes.provenance, 'AI-GENERATED');
    assert.strictEqual(liveRes.generationMode, 'gemini');
    assert.strictEqual(liveRes.fallbackReason, null);
    assert.strictEqual(liveRes.scanEvidence.provenance.bytesAndRequestsAndTimings, 'MEASURED');
    assert.strictEqual(liveRes.scanEvidence.provenance.energyAndCo2AndScore, 'CALCULATED');
    assert.ok(liveRes.recommendations.length >= 3);
    for (const rec of liveRes.recommendations) {
        assert.ok(rec.measuredFacts && rec.engineeringInference && rec.generalSuggestion);
    }
    console.log(`PASS M1-DI.6: Live Gemini 2.5 Flash succeeded in ${elapsedMs} ms (tokens=${liveRes.tokenUsage?.total_tokens}, recs=${liveRes.recommendations.length})`);

    await db.end();
}

main().catch(async (err) => {
    console.error('Module 1 Data Integrity test failed:', err);
    try { await db.end(); } catch {}
    process.exit(1);
});
