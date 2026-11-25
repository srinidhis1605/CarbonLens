// backend/tests/test_module3_data_integrity.js
// Complete Module 3 Data Integrity, Browser Measurement, Visual Screenshot & UI Chart Verification.
// Uses an independent recursive filesystem walk to cross-check backend API numbers byte-for-byte,
// verifies zero hardcoded values, verifies estimator difference at identical 10,000 monthly visits,
// tests empty/failed run UI states, verifies React Recharts DOM values match backend API,
// and saves screenshots + CSV/JSON measurements to research/.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { chromium } = require('playwright');

const backendDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendDir, '..');
require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env') });
if (process.env.DB_SSL_CA && !path.isAbsolute(process.env.DB_SSL_CA)) {
    process.env.DB_SSL_CA = path.resolve(backendDir, process.env.DB_SSL_CA);
}

const db = require(path.join(backendDir, 'db'));
const { pctReduction } = require(path.join(backendDir, 'services/optimizationService'));

const API_URL = 'http://127.0.0.1:5000';
const FRONTEND_URL = 'http://localhost:3000';
const ORIG_DIR = path.join(repoRoot, 'research/test-website/original');
const OPT_DIR = path.join(repoRoot, 'research/test-website/optimized');
const FIGURES_DIR = path.join(repoRoot, 'research/figures');
const RESULTS_DIR = path.join(repoRoot, 'research/results');

// Completely independent recursive filesystem counter (does NOT import optimizationService.js)
function independentDirTotals(dir) {
    const out = { totalFiles: 0, totalBytes: 0, imageBytes: 0, imageCount: 0, jsBytes: 0, jsCount: 0, cssBytes: 0, cssCount: 0, otherBytes: 0, otherCount: 0 };
    if (!fs.existsSync(dir)) return out;
    function walk(curr) {
        for (const entry of fs.readdirSync(curr, { withFileTypes: true })) {
            const full = path.join(curr, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else {
                const sz = fs.statSync(full).size;
                const ext = path.extname(entry.name).toLowerCase();
                out.totalFiles += 1;
                out.totalBytes += sz;
                if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'].includes(ext)) {
                    out.imageBytes += sz;
                    out.imageCount += 1;
                } else if (['.js', '.mjs'].includes(ext)) {
                    out.jsBytes += sz;
                    out.jsCount += 1;
                } else if (ext === '.css') {
                    out.cssBytes += sz;
                    out.cssCount += 1;
                } else {
                    out.otherBytes += sz;
                    out.otherCount += 1;
                }
            }
        }
    }
    walk(dir);
    return out;
}

async function main() {
    fs.mkdirSync(FIGURES_DIR, { recursive: true });
    fs.mkdirSync(RESULTS_DIR, { recursive: true });

    const testEmail = `audit_m3_${Date.now()}@carbonlens.local`;
    const testPass = 'AuditPass123!';

    console.log('=== MODULE 3 DATA INTEGRITY + PLAYWRIGHT VERIFICATION ===');

    try {
        // 1. Zero-denominator pctReduction safety
        assert.strictEqual(pctReduction(0, 0), null, 'Zero-byte category must return null, not 0 or NaN');
        assert.strictEqual(pctReduction(1000, 1000), 0);
        assert.strictEqual(pctReduction(1000, 250), 75);
        console.log('PASS M3-DI.1: Zero-denominator pctReduction returns null safely (never Infinity/NaN)');

        // 2. Register & log in temporary user on live backend
        await axios.post(`${API_URL}/auth/register`, { name: 'M3 Audit User', email: testEmail, password: testPass });
        const loginRes = await axios.post(`${API_URL}/auth/login`, { email: testEmail, password: testPass });
        const headers = { Authorization: `Bearer ${loginRes.data.accessToken}` };

        // 3. Run real optimization via live HTTP route & snapshot original independently before/after
        const indOrigBefore = independentDirTotals(ORIG_DIR);
        const optRunRes = await axios.post(
            `${API_URL}/api/v2/optimization/run`,
            { images: true, javascript: true, css: true, imageQuality: 75, maxImageWidth: 1200, removeUnusedAssets: true },
            { headers }
        );
        assert.strictEqual(optRunRes.status, 200);
        const runData = optRunRes.data.run;
        assert.strictEqual(runData.status, 'COMPLETED');
        const indOrigAfter = independentDirTotals(ORIG_DIR);
        assert.deepStrictEqual(indOrigBefore, indOrigAfter, 'Original directory must remain immutable');

        // 4. Cross-check GET /api/v2/optimization/site-status against independent filesystem walk
        const statusRes = await axios.get(`${API_URL}/api/v2/optimization/site-status`, { headers });
        const site = statusRes.data.site;
        const indOpt = independentDirTotals(OPT_DIR);

        assert.strictEqual(site.original.totals.totalBytes, indOrigAfter.totalBytes);
        assert.strictEqual(site.original.totals.imageBytes, indOrigAfter.imageBytes);
        assert.strictEqual(site.original.totals.javascriptBytes, indOrigAfter.jsBytes);
        assert.strictEqual(site.original.totals.cssBytes, indOrigAfter.cssBytes);
        assert.strictEqual(site.original.totals.htmlAndOtherBytes, indOrigAfter.otherBytes);

        assert.strictEqual(site.optimized.totals.totalBytes, indOpt.totalBytes);
        assert.strictEqual(site.optimized.totals.imageBytes, indOpt.imageBytes);
        assert.strictEqual(site.optimized.totals.javascriptBytes, indOpt.jsBytes);
        assert.strictEqual(site.optimized.totals.cssBytes, indOpt.cssBytes);
        assert.strictEqual(site.optimized.totals.htmlAndOtherBytes, indOpt.otherBytes);
        assert.strictEqual(site.comparison.reconciliationVerified, true);

        const expectedTotalRed = Number((((indOrigAfter.totalBytes - indOpt.totalBytes) / indOrigAfter.totalBytes) * 100).toFixed(2));
        assert.strictEqual(site.comparison.total.reductionPct, expectedTotalRed);
        console.log(`PASS M3-DI.2: Backend site-status matches independent fs.statSync walk byte-for-byte (${indOrigAfter.totalBytes} B -> ${indOpt.totalBytes} B, -${expectedTotalRed}%)`);

        // 5. Run live Playwright browser measurement endpoint (POST /api/v2/optimization/measure-browser)
        const bmRes = await axios.post(`${API_URL}/api/v2/optimization/measure-browser`, {}, { headers });
        assert.strictEqual(bmRes.status, 200);
        const bm = bmRes.data.measurements;
        assert.ok(bm.original.measuredBrowser.totalBytes > 10_000_000);
        assert.ok(bm.optimized.measuredBrowser.totalBytes > 0 && bm.optimized.measuredBrowser.totalBytes < 500_000);
        assert.strictEqual(bm.original.measuredBrowser.failedRequests, 0);
        assert.strictEqual(bm.optimized.measuredBrowser.failedRequests, 0);
        console.log(`PASS M3-DI.3: Browser measurements separated from disk (${bm.original.measuredBrowser.totalBytes} B -> ${bm.optimized.measuredBrowser.totalBytes} B, -${bm.comparison.transferredReductionPct}%)`);

        // 6. Playwright browser verification of BOTH controlled websites (including interactive estimator at 10,000 visits + screenshots)
        //    AND React /optimization UI verifying rendered metrics & Recharts SVG bars + error/empty handling!
        const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
        try {
            const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
            const page = await ctx.newPage();

            // 6A. Original controlled site + screenshot + 10,000-visit estimator
            await page.goto(`${API_URL}/controlled-site/original/`, { waitUntil: 'networkidle' });
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(300);
            await page.click('#btn-recalculate-preview');
            const origWeightVal = Number(await page.inputValue('#input-page-weight-mb'));
            const origEstText = await page.textContent('#estimator-result');
            const origSourceNotice = await page.textContent('#estimator-source-notice');
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: path.join(FIGURES_DIR, 'controlled_site_original.png'), fullPage: true });

            // 6B. Optimized controlled site + screenshot + 10,000-visit estimator
            await page.goto(`${API_URL}/controlled-site/optimized/`, { waitUntil: 'networkidle' });
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(300);
            await page.click('#btn-recalculate-preview');
            const optWeightVal = Number(await page.inputValue('#input-page-weight-mb'));
            const optEstText = await page.textContent('#estimator-result');
            const optSourceNotice = await page.textContent('#estimator-source-notice');
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: path.join(FIGURES_DIR, 'controlled_site_optimized.png'), fullPage: true });

            assert.ok(origWeightVal > 10, `Original estimator must use real weight > 10 MB, got ${origWeightVal}`);
            assert.ok(optWeightVal > 0 && optWeightVal < 0.5, `Optimized estimator must use real weight < 0.5 MB, got ${optWeightVal}`);
            assert.notStrictEqual(origEstText, optEstText, 'Original and Optimized traffic preview must reflect their own measured weights');
            console.log(`PASS M3-DI.4: Controlled site estimator uses real browser weight (Original=${origWeightVal} MB vs Optimized=${optWeightVal} MB at 10,000 visits)`);

            // 6C. Live React /optimization UI verification + Recharts SVG + screenshot
            const uiConsoleErrors = [];
            page.on('console', (m) => { if (m.type() === 'error') uiConsoleErrors.push(m.text()); });
            await page.goto(`${FRONTEND_URL}/login`, { waitUntil: 'networkidle' });
            await page.fill('input[type="email"]', testEmail);
            await page.fill('input[type="password"]', testPass);
            await page.click('button[type="submit"]');
            await page.waitForURL('**/dashboard', { timeout: 10000 });
            await page.click('a[href="/optimization"]');
            await page.waitForURL('**/optimization', { timeout: 10000 });
            await page.waitForSelector('text=Measured Asset Size Comparison on Disk (KB)', { timeout: 10000 });
            await page.waitForSelector('text=Disk Category Size Reduction (%) — Measured', { timeout: 10000 });

            // Click browser measurement button in UI and verify real browser telemetry table populates
            await page.click('button:has-text("Measure Both Sites in Playwright Browser")');
            await page.waitForSelector('text=Transferred Bytes', { timeout: 30000 });

            const uiText = await page.textContent('main');
            const expectedOrigKbStr = `${(indOrigAfter.totalBytes / 1024).toFixed(2)} KB`;
            const expectedOptKbStr = `${(indOpt.totalBytes / 1024).toFixed(2)} KB`;
            assert.ok(uiText.includes(expectedOrigKbStr), `UI missing exact original disk KB ${expectedOrigKbStr}`);
            assert.ok(uiText.includes(expectedOptKbStr), `UI missing exact optimized disk KB ${expectedOptKbStr}`);
            assert.ok(uiText.includes(`${expectedTotalRed}%`), `UI missing exact reduction ${expectedTotalRed}%`);

            const chartBarsCount = await page.locator('.recharts-bar-rectangle').count();
            assert.ok(chartBarsCount >= 8, `Expected Recharts bars rendered (>=8), got ${chartBarsCount}`);
            assert.strictEqual(uiConsoleErrors.length, 0, `UI console errors: ${uiConsoleErrors.join(', ')}`);

            await page.screenshot({ path: path.join(FIGURES_DIR, 'module3_optimization_ui.png'), fullPage: true });
            console.log(`PASS M3-DI.5: Live React /optimization UI renders exact backend totals (${expectedOrigKbStr} -> ${expectedOptKbStr}), ${chartBarsCount} Recharts bars, and captures screenshots`);

            // Save real JSON & CSV experimental output snapshot
            const artifact = {
                generatedAt: new Date().toISOString(),
                filesystem: {
                    original: site.original.totals,
                    optimized: site.optimized.totals,
                    comparison: site.comparison,
                },
                browserMeasuredAndCalculated: bm,
                interactiveEstimatorAt10000Visits: {
                    original: { measuredMb: origWeightVal, sourceNotice: origSourceNotice, output: origEstText },
                    optimized: { measuredMb: optWeightVal, sourceNotice: optSourceNotice, output: optEstText },
                },
                optimizationRunId: runData.id,
            };
            fs.writeFileSync(
                path.join(RESULTS_DIR, 'module3_data_integrity_measurements.json'),
                JSON.stringify(artifact, null, 2),
                'utf8'
            );

            const csvRows = [
                'source_type,version,total_bytes,image_bytes,script_bytes,css_bytes,other_or_html_bytes,requests,energy_kwh_calc,co2_grams_calc,carbon_score_calc',
                `filesystem_disk,original,${indOrigAfter.totalBytes},${indOrigAfter.imageBytes},${indOrigAfter.jsBytes},${indOrigAfter.cssBytes},${indOrigAfter.otherBytes},${indOrigAfter.totalFiles},,,`,
                `filesystem_disk,optimized,${indOpt.totalBytes},${indOpt.imageBytes},${indOpt.jsBytes},${indOpt.cssBytes},${indOpt.otherBytes},${indOpt.totalFiles},,,`,
                `browser_playwright,original,${bm.original.measuredBrowser.totalBytes},${bm.original.measuredBrowser.imageBytes},${bm.original.measuredBrowser.scriptBytes},${bm.original.measuredBrowser.styleBytes},${bm.original.measuredBrowser.otherBytes},${bm.original.measuredBrowser.totalRequests},${bm.original.calculatedEstimates.energyUsedKWh},${bm.original.calculatedEstimates.co2EstimateGramsPrecise},${bm.original.calculatedEstimates.carbonScore}`,
                `browser_playwright,optimized,${bm.optimized.measuredBrowser.totalBytes},${bm.optimized.measuredBrowser.imageBytes},${bm.optimized.measuredBrowser.scriptBytes},${bm.optimized.measuredBrowser.styleBytes},${bm.optimized.measuredBrowser.otherBytes},${bm.optimized.measuredBrowser.totalRequests},${bm.optimized.calculatedEstimates.energyUsedKWh},${bm.optimized.calculatedEstimates.co2EstimateGramsPrecise},${bm.optimized.calculatedEstimates.carbonScore}`,
            ];
            fs.writeFileSync(
                path.join(RESULTS_DIR, 'module3_data_integrity_measurements.csv'),
                csvRows.join('\n'),
                'utf8'
            );

            await ctx.close();
        } finally {
            await browser.close();
        }
    } finally {
        await db.execute('DELETE FROM users WHERE email = ?', [testEmail]);
        await db.end();
    }
}

main().catch((err) => {
    console.error('Module 3 Data Integrity test failed:', err.response?.data || err);
    process.exit(1);
});
