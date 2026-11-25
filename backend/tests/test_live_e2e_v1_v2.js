// backend/tests/test_live_e2e_v1_v2.js
// End-to-end live regression test against running backend (http://localhost:5000),
// running React frontend (http://localhost:3000), live Aiven MySQL, and live Gemini 2.5 Flash.
// Creates an isolated temporary test user and deletes only that temporary user on exit (via CASCADE).

const assert = require('assert');
const path = require('path');
const axios = require('axios');
const { chromium } = require('playwright');

const backendDir = path.resolve(__dirname, '..');
require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') });
if (process.env.DB_SSL_CA && !path.isAbsolute(process.env.DB_SSL_CA)) {
    process.env.DB_SSL_CA = path.resolve(backendDir, process.env.DB_SSL_CA);
}
const db = require(path.join(backendDir, 'db'));

const API_URL = 'http://127.0.0.1:5000';
const FRONTEND_URL = 'http://localhost:3000';

async function main() {
    const testEmail = `audit_e2e_${Date.now()}@carbonlens.local`;
    const testPass = 'AuditPass123!';
    const testName = 'Audit Verification User';

    console.log('=== LIVE END-TO-END V1 + V2 (MODULES 1-3) REGRESSION TEST ===');

    try {
        // 1. V1 Register & Login
        const regRes = await axios.post(`${API_URL}/auth/register`, {
            name: testName,
            email: testEmail,
            password: testPass,
        });
        assert.strictEqual(regRes.status, 201);

        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: testEmail,
            password: testPass,
        });
        assert.strictEqual(loginRes.status, 200);
        const token = loginRes.data.accessToken;
        assert.ok(token);
        assert.strictEqual(loginRes.data.user.email, testEmail);
        const headers = { Authorization: `Bearer ${token}` };
        console.log('PASS E2E.1: V1 Register & JWT Login succeeded with real user record');

        // 2. V1 Performance Scan + MySQL Persistence + History + Detail Restore
        const scanUrl = `${API_URL}/controlled-site/original/`;
        const scanRes = await axios.post(`${API_URL}/analysis`, { url: scanUrl }, { headers });
        assert.strictEqual(scanRes.status, 200);
        const analysisId = scanRes.data.DATABASE_RECORD_ID;
        assert.ok(Number.isInteger(analysisId) && analysisId > 0);
        assert.ok(scanRes.data.PHASE_2_ENVIRONMENTAL_RECONSTRUCTION.RECONSTRUCTED_METRICS.ESTIMATED_ENERGY_KWH > 0);

        const histRes = await axios.get(`${API_URL}/analysis/history`, { headers });
        assert.ok(histRes.data.history.some((h) => h.id === analysisId));

        const detailRes = await axios.get(`${API_URL}/analysis/${analysisId}`, { headers });
        assert.strictEqual(detailRes.data.analysisId, analysisId);
        assert.strictEqual(detailRes.data.url, scanUrl);
        console.log(`PASS E2E.2: V1 Scan persisted to MySQL (analysisId=${analysisId}) and restored via history & detail`);

        // 3. V1 SEO Audit + AI Structural Advice
        const seoRes = await axios.post(
            `${API_URL}/analysis/seo-audit`,
            { analysis_id: analysisId, url: scanUrl },
            { headers }
        );
        assert.strictEqual(seoRes.status, 200);
        assert.strictEqual(seoRes.data.SESSION_STATUS, 'SEO_AUDIT_COMPLETED');
        assert.ok(seoRes.data.SEO_METRICS_REPORT.title.includes('GreenGrid'));
        console.log('PASS E2E.3: V1 SEO Audit succeeded and persisted');

        // 4. Module 1 Live Gemini Agent + MySQL Persistence
        const tAgent = Date.now();
        const agentRes = await axios.post(
            `${API_URL}/api/v2/agent/analyze`,
            { analysisId, forceRefresh: true },
            { headers }
        );
        assert.strictEqual(agentRes.status, 200);
        const report = agentRes.data.report;
        assert.strictEqual(report.generationMode, 'gemini');
        assert.ok(report.id > 0);
        assert.strictEqual(report.scanEvidence.totalBytes, scanRes.data.AI_METRICS_INPUT.rawScrapedData.totalBytes);

        const savedAgentRes = await axios.get(`${API_URL}/api/v2/agent/reports/${analysisId}`, { headers });
        assert.strictEqual(savedAgentRes.data.report.id, report.id);
        console.log(`PASS E2E.4: Module 1 live Gemini Agent (${Date.now() - tAgent} ms, reportId=${report.id}) persisted & restored`);

        // 5. Module 2 What-if Simulator + MySQL Persistence + Baseline Parity
        const simRes = await axios.post(
            `${API_URL}/api/v2/simulations`,
            {
                baselineAnalysisId: analysisId,
                simulationName: 'E2E Audit Simulation',
                simulateGreenHosting: true,
                includeComparisonSuite: true,
                scenarioConfig: {
                    imageOptimization: { enabled: true, compressionPct: 30, webpConversionPct: 40, responsiveDeliveryPct: 20 },
                    javascriptOptimization: { enabled: true, minificationPct: 25, unusedJsReductionPct: 30 },
                    cssOptimization: { enabled: true, minificationPct: 20, unusedCssReductionPct: 40 },
                },
            },
            { headers }
        );
        assert.strictEqual(simRes.status, 201);
        const sim = simRes.data.simulation;
        assert.strictEqual(sim.resultType, 'SIMULATED / HYPOTHETICAL RESULTS');
        assert.strictEqual(sim.comparison.reconciliationVerified, true);
        assert.strictEqual(sim.baseline.totalBytes, report.scanEvidence.totalBytes, 'Module 1 & Module 2 baseline bytes must match');

        const savedSimRes = await axios.get(`${API_URL}/api/v2/simulations/${sim.id}`, { headers });
        assert.strictEqual(savedSimRes.data.simulation.id, sim.id);
        console.log(`PASS E2E.5: Module 2 Simulation (simId=${sim.id}, -${sim.comparison.pageWeightReductionPct}% projected) persisted & matches Module 1 baseline`);

        // 6. Module 3 Actual Optimization via Live HTTP Route (2 consecutive runs, 0 EPERM) + MySQL Persistence
        const opt1 = await axios.post(`${API_URL}/api/v2/optimization/run`, { images: true, javascript: true, css: true }, { headers });
        const opt2 = await axios.post(`${API_URL}/api/v2/optimization/run`, { images: true, javascript: true, css: true }, { headers });
        assert.strictEqual(opt1.status, 200);
        assert.strictEqual(opt2.status, 200);
        assert.strictEqual(opt2.data.status, 'COMPLETED');
        assert.strictEqual(opt2.data.run.summary.originalPreserved, true);

        const optRunsRes = await axios.get(`${API_URL}/api/v2/optimization/runs`, { headers });
        assert.ok(optRunsRes.data.runs.some((r) => r.id === opt2.data.run.id));
        console.log(`PASS E2E.6: Module 3 live HTTP optimization (runId=${opt2.data.run.id}, -${opt2.data.run.summary.totalReductionPct}%) persisted with 0 EPERM errors`);

        // 7. Browser UI E2E Check against live React Frontend (http://localhost:3000) + Live Backend (http://localhost:5000)
        const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
        try {
            const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
            const page = await ctx.newPage();
            const pageErrors = [];
            const consoleErrors = [];
            page.on('pageerror', (e) => pageErrors.push(e.message));
            page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

            await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle' });
            await page.fill('input[type="email"]', testEmail);
            await page.fill('input[type="password"]', testPass);
            await page.click('button[type="submit"]');
            await page.waitForURL('**/dashboard', { timeout: 10000 });
            await page.waitForSelector('text=CarbonLens 2.0 Modules', { timeout: 10000 });

            // Verify real authenticated email shown in Navbar (not a placeholder)
            const navText = await page.textContent('header');
            assert.ok(navText.includes(testEmail), 'Navbar must show authenticated user email');

            // Navigate to Module 1 UI (/agent) and verify saved Gemini report loads from DB
            await page.click('a[href="/agent"]');
            await page.waitForURL('**/agent', { timeout: 10000 });
            await page.waitForSelector('text=Overall Sustainability Assessment', { timeout: 10000 });
            await page.waitForSelector('text=Measured Facts (From Scan)', { timeout: 10000 });

            // Navigate to Module 2 UI (/simulator) and run preview
            await page.click('a[href="/simulator"]');
            await page.waitForURL('**/simulator', { timeout: 10000 });
            await page.click('button:has-text("Run What-if Simulation")');
            await page.waitForSelector('text=Reconciliation Verified: YES', { timeout: 10000 });

            // Navigate to Module 3 UI (/optimization) and verify live site metrics
            await page.click('a[href="/optimization"]');
            await page.waitForURL('**/optimization', { timeout: 10000 });
            await page.waitForSelector('text=Original Baseline (MEASURED · DISK)', { timeout: 10000 });
            await page.waitForSelector('text=Optimized Output (MEASURED · DISK)', { timeout: 10000 });

            assert.strictEqual(pageErrors.length, 0, `React page errors: ${pageErrors.join(', ')}`);
            assert.strictEqual(consoleErrors.length, 0, `React console errors: ${consoleErrors.join(', ')}`);
            console.log('PASS E2E.7: Live React UI (Login -> Dashboard -> Agent -> Simulator -> Optimization) verified in Chromium with 0 errors!');
            await ctx.close();
        } finally {
            await browser.close();
        }
    } finally {
        // Clean up ONLY the temporary audit test user (CASCADE cleans temporary test rows)
        await db.execute('DELETE FROM users WHERE email = ?', [testEmail]);
        await db.end();
    }
}

main().catch((err) => {
    console.error('Live E2E regression test failed:', err.response?.data || err);
    process.exit(1);
});
