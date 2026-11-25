// backend/tests/verify_modules_1_2_3.js
// Standalone verification & demonstration test suite for Modules 1, 2, and 3.
// Tests real logic, error handling, edge cases, sharp/terser/clean-css execution,
// and live Playwright browser verification of the controlled original vs. optimized websites.

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const sharp = require('sharp');
const { chromium } = require('playwright');

const {
    runSustainabilityAgent,
    buildStructuredScanInput,
    validateAgentResponse,
} = require('../services/sustainabilityAgentService');

const {
    runWhatIfSimulation,
    runScenarioComparisonSuite,
    computeCompoundedReductionPct,
} = require('../services/simulationService');

const {
    ORIGINAL_DIR,
    OPTIMIZED_DIR,
    getControlledSiteStatus,
    runControlledOptimization,
} = require('../services/optimizationService');

const { calculateSustainabilityMetrics } = require('../services/normalizationService');

const results = {
    passed: 0,
    failed: 0,
    details: [],
};

async function test(name, fn) {
    try {
        await fn();
        results.passed += 1;
        results.details.push({ name, status: 'PASS' });
        console.log(`PASS: ${name}`);
    } catch (err) {
        results.failed += 1;
        results.details.push({ name, status: 'FAIL', error: err.message });
        console.error(`FAIL: ${name} -> ${err.message}`);
    }
}

async function run() {
    console.log('\n======================================================================');
    console.log('CARBONLENS 2.0 — MODULES 1, 2, AND 3 VERIFICATION & DEMONSTRATION');
    console.log('======================================================================\n');

    // -------------------------------------------------------------------------
    // MODULE 1: AI SUSTAINABILITY AGENT
    // -------------------------------------------------------------------------
    console.log('--- MODULE 1: AI SUSTAINABILITY AGENT ---');

    const sampleScanInput = {
        analysisId: 101,
        url: 'https://sample-heavy-site.example',
        totalBytes: 2_600_000,
        imageBytes: 1_750_000,
        imageCount: 14,
        scriptBytes: 580_000,
        scriptCount: 15,
        styleBytes: 140_000,
        styleCount: 7,
        fontBytes: 80_000,
        fontCount: 2,
        totalRequests: 48,
        thirdPartyRequests: 19,
        timeToFirstByteMs: 850,
        domContentLoadedMs: 1850,
        pageLoadTimeMs: 3600,
        isGreenHost: false,
    };

    let module1ValidDemo = null;
    let module1FallbackDemo = null;

    await test('M1.1 Valid Gemini JSON response parses & validates strictly', async () => {
        const mockGeminiClient = {
            chat: {
                completions: {
                    create: async () => ({
                        choices: [
                            {
                                message: {
                                    content: JSON.stringify({
                                        overallAssessment:
                                            'The site transfers 2.48 MB across 48 requests with images and scripts dominating weight. Energy and CO2 figures are calculated estimates.',
                                        recommendations: [
                                            {
                                                issueIdentified: 'Heavy unoptimized image payload',
                                                evidenceFromScan: 'Images consume 1709 KB (67.3% of total page weight) across 14 requests.',
                                                whyItMatters: 'Large raster transfers inflate data transmission energy estimates and delay rendering.',
                                                recommendedSolution: 'Convert images to WebP, resize to container width, and lazy-load below-the-fold images.',
                                                expectedImprovement: 'Substantial reduction in image transfer weight and lower estimated page CO2.',
                                                estimatedImplementationDifficulty: 'LOW',
                                                priority: 'HIGH',
                                                resourceCategory: 'Images',
                                            },
                                            {
                                                issueIdentified: 'Large JavaScript bundle footprint',
                                                evidenceFromScan: '15 scripts total 566.4 KB (22.3% of page weight).',
                                                whyItMatters: 'JavaScript increases network transfer and client CPU parsing energy.',
                                                recommendedSolution: 'Minify bundles, apply tree-shaking, and defer non-critical scripts.',
                                                expectedImprovement: 'Lower JS byte transfer and faster DOM readiness.',
                                                estimatedImplementationDifficulty: 'MEDIUM',
                                                priority: 'MEDIUM',
                                                resourceCategory: 'JavaScript',
                                            },
                                            {
                                                issueIdentified: 'Non-green hosting infrastructure',
                                                evidenceFromScan: 'Green Web Foundation check returned false (442 gCO2/kWh assumed).',
                                                whyItMatters: 'Grid carbon intensity scales calculated emissions per kWh.',
                                                recommendedSolution: 'Consider migrating CDN/hosting to a verified green energy provider.',
                                                expectedImprovement: 'Lower assumed grid carbon intensity factor.',
                                                estimatedImplementationDifficulty: 'HIGH',
                                                priority: 'LOW',
                                                resourceCategory: 'Hosting',
                                            },
                                        ],
                                    }),
                                },
                            },
                        ],
                    }),
                },
            },
        };

        const report = await runSustainabilityAgent(sampleScanInput, { llmClient: mockGeminiClient });
        assert.strictEqual(report.generationMode, 'gemini');
        assert.strictEqual(report.provenance, 'AI-GENERATED');
        assert.strictEqual(report.recommendations.length, 3);
        assert.strictEqual(report.recommendations[0].priority, 'HIGH');
        module1ValidDemo = report;
    });

    await test('M1.2 Invalid JSON from Gemini triggers deterministic fallback', async () => {
        const badJsonClient = {
            chat: {
                completions: {
                    create: async () => ({ choices: [{ message: { content: 'Not valid JSON {{{' } }] }),
                },
            },
        };
        const report = await runSustainabilityAgent(sampleScanInput, { llmClient: badJsonClient });
        assert.strictEqual(report.generationMode, 'deterministic_fallback');
        assert.ok(report.fallbackReason.includes('INVALID_JSON'));
        assert.ok(report.recommendations.length >= 3);
    });

    await test('M1.3 Missing required fields in AI JSON triggers deterministic fallback', async () => {
        const incompleteClient = {
            chat: {
                completions: {
                    create: async () => ({
                        choices: [
                            {
                                message: {
                                    content: JSON.stringify({
                                        overallAssessment: 'Too short summary here is ok length for test.',
                                        recommendations: [{ issueIdentified: 'Only title provided' }],
                                    }),
                                },
                            },
                        ],
                    }),
                },
            },
        };
        const report = await runSustainabilityAgent(sampleScanInput, { llmClient: incompleteClient });
        assert.strictEqual(report.generationMode, 'deterministic_fallback');
        assert.ok(report.fallbackReason.includes('MISSING_FIELD'));
    });

    await test('M1.4 API rate-limit (429) triggers deterministic fallback', async () => {
        const rateLimitClient = {
            chat: {
                completions: {
                    create: async () => {
                        const err = new Error('Rate limit exceeded');
                        err.status = 429;
                        throw err;
                    },
                },
            },
        };
        const report = await runSustainabilityAgent(sampleScanInput, { llmClient: rateLimitClient });
        assert.strictEqual(report.generationMode, 'deterministic_fallback');
        assert.ok(report.fallbackReason.includes('429'));
        module1FallbackDemo = report;
    });

    await test('M1.5 API timeout triggers deterministic fallback', async () => {
        const slowClient = {
            chat: {
                completions: {
                    create: () => new Promise((resolve) => setTimeout(resolve, 400)),
                },
            },
        };
        const report = await runSustainabilityAgent(sampleScanInput, {
            llmClient: slowClient,
            timeoutMs: 40,
        });
        assert.strictEqual(report.generationMode, 'deterministic_fallback');
        assert.ok(report.fallbackReason.toLowerCase().includes('timeout'));
    });

    await test('M1.6 Fallback recommendations adapt dynamically to scan evidence (JS-heavy vs Image-heavy)', async () => {
        const jsHeavyScan = {
            url: 'https://js-heavy.example',
            totalBytes: 1_400_000,
            imageBytes: 50_000,
            imageCount: 1,
            scriptBytes: 1_200_000,
            scriptCount: 22,
            styleBytes: 40_000,
            styleCount: 2,
            totalRequests: 30,
            thirdPartyRequests: 4,
            isGreenHost: true,
        };
        const report = await runSustainabilityAgent(jsHeavyScan, { llmClient: null });
        assert.strictEqual(report.generationMode, 'deterministic_fallback');
        assert.strictEqual(report.recommendations[0].resourceCategory, 'JavaScript');
        assert.strictEqual(report.recommendations[0].priority, 'HIGH');
        assert.ok(report.recommendations[0].evidenceFromScan.includes('22 script'));
    });

    await test('M1.7 Direct validator rejects empty responses', () => {
        assert.throws(() => validateAgentResponse(''), /EMPTY_AI_RESPONSE/);
    });

    // -------------------------------------------------------------------------
    // MODULE 2: WHAT-IF OPTIMIZATION SIMULATOR
    // -------------------------------------------------------------------------
    console.log('\n--- MODULE 2: WHAT-IF OPTIMIZATION SIMULATOR ---');

    const baselineRow = {
        id: 101,
        url: 'https://sample-heavy-site.example',
        totalBytes: 2_600_000,
        image_bytes: 1_750_000,
        image_count: 14,
        script_bytes: 580_000,
        script_count: 15,
        style_bytes: 140_000,
        style_count: 7,
        font_bytes: 80_000,
        font_count: 2,
        total_requests: 48,
        third_party_requests: 19,
        is_green_host: 0,
    };

    let module2Demo = null;

    await test('M2.1 Scenario A (Images only) recalculates bytes, energy, CO2, and score', () => {
        const sim = runWhatIfSimulation(baselineRow, {
            imageOptimization: {
                enabled: true,
                compressionPct: 30,
                webpConversionPct: 30,
                responsiveDeliveryPct: 0,
                removeUnusedImagesPct: 0,
            },
        });
        // Multiplicative compounding check: 1 - (0.7 * 0.7) = 51% (not 60%)
        assert.strictEqual(sim.assumptions.imageOptimization.effectiveReductionPct, 51);
        assert.strictEqual(sim.comparison.reconciliationVerified, true);
        assert.strictEqual(sim.simulated.scriptBytes, baselineRow.script_bytes);
        assert.ok(sim.simulated.totalBytes < sim.baseline.totalBytes);
        assert.ok(sim.simulated.co2EstimateGramsPrecise < sim.baseline.co2EstimateGramsPrecise);
        assert.ok(sim.simulated.carbonScore >= sim.baseline.carbonScore);
        assert.strictEqual(sim.resultType, 'SIMULATED / HYPOTHETICAL RESULTS');
    });

    await test('M2.2 Combined Scenarios (A+B+C+D) prevent double counting and reconcile totals', () => {
        const sim = runWhatIfSimulation(
            baselineRow,
            {
                imageOptimization: { enabled: true, compressionPct: 25, webpConversionPct: 35, responsiveDeliveryPct: 20, removeUnusedImagesPct: 0 },
                javascriptOptimization: { enabled: true, minificationPct: 20, unusedJsReductionPct: 30, codeSplittingPct: 15, removeUnnecessaryScriptsPct: 0 },
                cssOptimization: { enabled: true, minificationPct: 20, unusedCssReductionPct: 35, stylesheetConsolidationPct: 10 },
                resourceRequestOptimization: { enabled: true, httpRequestReductionPct: 20, thirdPartyReductionPct: 40, resourceLoadingOptimizationPct: 15 },
            },
            { simulationName: 'Full Stack Optimization What-If' }
        );

        assert.strictEqual(sim.comparison.reconciliationVerified, true);
        const sumCategories =
            sim.simulated.imageBytes +
            sim.simulated.scriptBytes +
            sim.simulated.styleBytes +
            sim.simulated.fontBytes +
            sim.simulated.otherBytes;
        assert.strictEqual(sim.simulated.totalBytes, sumCategories);
        assert.ok(sim.simulated.totalBytes >= 0);
        assert.ok(sim.simulated.totalRequests < sim.baseline.totalRequests);
        assert.ok(sim.simulated.thirdPartyRequests < sim.baseline.thirdPartyRequests);
        module2Demo = sim;
    });

    await test('M2.3 Validation rejects >100%, negative percentages, out-of-bounds values, and no-scenario runs', () => {
        assert.throws(
            () => runWhatIfSimulation(baselineRow, { imageOptimization: { enabled: true, compressionPct: 120 } }),
            /Out-of-range/
        );
        assert.throws(
            () => runWhatIfSimulation(baselineRow, { imageOptimization: { enabled: true, compressionPct: -5 } }),
            /Out-of-range/
        );
        assert.throws(
            () => runWhatIfSimulation(baselineRow, { javascriptOptimization: { enabled: true, minificationPct: 90 } }),
            /Out-of-bounds/
        );
        assert.throws(
            () => runWhatIfSimulation(baselineRow, { imageOptimization: { enabled: false } }),
            /Enable at least one optimization scenario/
        );
    });

    await test('M2.4 Multiplicative compounding caps correctly and never exceeds 100%', () => {
        const res = computeCompoundedReductionPct({ a: 60, b: 60, c: 60 }, 90);
        assert.strictEqual(res.capApplied, true);
        assert.strictEqual(res.effectiveReductionPct, 90);
    });

    await test('M2.5 Scenario comparison suite generates individual A/B/C/D + combined results', () => {
        const suite = runScenarioComparisonSuite(baselineRow);
        assert.ok(suite.individual.imageOptimization);
        assert.ok(suite.individual.javascriptOptimization);
        assert.ok(suite.individual.cssOptimization);
        assert.ok(suite.individual.resourceRequestOptimization);
        assert.ok(suite.combined);
        assert.ok(suite.combined.comparison.bytesSaved >= suite.individual.imageOptimization.comparison.bytesSaved);
    });

    // -------------------------------------------------------------------------
    // MODULE 3: ACTUAL WEBSITE OPTIMIZATION DEMONSTRATION
    // -------------------------------------------------------------------------
    console.log('\n--- MODULE 3: ACTUAL WEBSITE OPTIMIZATION ---');

    let module3StatusBefore = null;
    let module3RunResult = null;
    let module3BrowserCheck = null;

    await test('M3.1 Controlled test website baseline exists and is inspected cleanly', async () => {
        module3StatusBefore = await getControlledSiteStatus();
        assert.strictEqual(module3StatusBefore.original.exists, true);
        assert.ok(module3StatusBefore.original.totals.imageCount >= 7);
        assert.ok(module3StatusBefore.original.totals.javascriptCount >= 3);
        assert.ok(module3StatusBefore.original.totals.cssCount >= 3);
    });

    await test('M3.2 Real optimization (sharp + terser + clean-css) executes, preserves original/, and verifies all outputs', async () => {
        module3RunResult = await runControlledOptimization({
            images: true,
            javascript: true,
            css: true,
            imageQuality: 75,
            maxImageWidth: 1200,
            removeUnusedAssets: true,
        });

        assert.strictEqual(module3RunResult.status, 'COMPLETED');
        assert.strictEqual(module3RunResult.summary.originalPreserved, true);
        assert.strictEqual(module3RunResult.errors.length, 0);
        assert.ok(module3RunResult.summary.byCategory.images.reductionPct > 50);
        assert.ok(module3RunResult.summary.byCategory.javascript.reductionPct > 50);
        assert.ok(module3RunResult.summary.byCategory.css.reductionPct > 50);

        // Verify every optimized WebP image using sharp metadata()
        const webpOps = module3RunResult.operations.filter((op) => op.category === 'image');
        for (const op of webpOps) {
            const absPath = path.join(OPTIMIZED_DIR, op.optimizedFile);
            assert.ok(fs.existsSync(absPath), `Missing optimized image ${op.optimizedFile}`);
            const meta = await sharp(absPath).metadata();
            assert.strictEqual(meta.format, 'webp');
            assert.ok(meta.width > 0 && meta.height > 0);
            assert.ok(op.optimizedBytes < op.originalBytes, `Expected ${op.optimizedFile} to be smaller`);
        }

        // Verify unused assets were removed from optimized/index.html
        const optHtml = fs.readFileSync(path.join(OPTIMIZED_DIR, 'index.html'), 'utf8');
        assert.ok(!optHtml.includes('legacy-unused-widget.js'));
        assert.ok(!optHtml.includes('legacy-print-unused.css'));
        assert.ok(optHtml.includes('.webp'));
        assert.ok(optHtml.includes('.min.js'));
        assert.ok(optHtml.includes('.min.css'));
    });

    await test('M3.3 Optimized website loads & functions interactively in real Chromium via Playwright (and uses fewer network bytes than original)', async () => {
        const app = express();
        app.use('/controlled-site/original', express.static(ORIGINAL_DIR));
        app.use('/controlled-site/optimized', express.static(OPTIMIZED_DIR));

        const server = await new Promise((resolve) => {
            const s = app.listen(0, '127.0.0.1', () => resolve(s));
        });
        const port = server.address().port;
        const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

        async function inspectInBrowser(url) {
            const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
            const page = await context.newPage();
            const consoleErrors = [];
            const pageErrors = [];
            let networkBytes = 0;
            let networkRequests = 0;

            page.on('console', (msg) => {
                if (msg.type() === 'error') consoleErrors.push(msg.text());
            });
            page.on('pageerror', (err) => pageErrors.push(err.message));
            page.on('response', async (res) => {
                networkRequests += 1;
                try {
                    const body = await res.body();
                    networkBytes += body ? body.length : 0;
                } catch {}
            });

            await page.goto(url, { waitUntil: 'networkidle' });
            // Scroll to trigger lazy-loaded images so all images are verified
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(300);

            const domState = await page.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll('img'));
                const brokenImgs = imgs.filter((img) => !img.complete || img.naturalWidth === 0).map((i) => i.src);
                const kpiCount = document.querySelectorAll('#metrics-kpi-strip .metric-box').length;
                const estimatorText = document.getElementById('estimator-result')?.textContent || '';
                const h1Style = getComputedStyle(document.querySelector('h1'));
                return {
                    appReady: window.__GREENGRID_APP_READY__ === true,
                    catalogReady: window.__GREENGRID_CATALOG_READY__ === true,
                    totalImgs: imgs.length,
                    brokenImgs,
                    kpiCount,
                    estimatorText,
                    h1FontSize: h1Style.fontSize,
                };
            });

            // Test interactive filter button click
            await page.click('.filter-btn[data-filter="images"]');
            const visibleCardsAfterFilter = await page.evaluate(() => {
                return Array.from(document.querySelectorAll('.feature-card')).filter(
                    (el) => getComputedStyle(el).display !== 'none'
                ).length;
            });

            // Test interactive estimator recalculation (uses real Performance-API measured page weight)
            await page.fill('#input-monthly-visits', '50000');
            await page.click('#btn-recalculate-preview');
            const updatedEstimator = await page.textContent('#estimator-result');
            const measuredInputMb = Number(await page.inputValue('#input-page-weight-mb'));

            await context.close();
            return {
                url,
                networkRequests,
                networkBytes,
                consoleErrors,
                pageErrors,
                domState,
                visibleCardsAfterFilter,
                updatedEstimator,
                measuredInputMb,
            };
        }

        try {
            const origCheck = await inspectInBrowser(`http://127.0.0.1:${port}/controlled-site/original/`);
            const optCheck = await inspectInBrowser(`http://127.0.0.1:${port}/controlled-site/optimized/`);

            assert.strictEqual(origCheck.consoleErrors.length, 0);
            assert.strictEqual(origCheck.pageErrors.length, 0);
            assert.strictEqual(optCheck.consoleErrors.length, 0);
            assert.strictEqual(optCheck.pageErrors.length, 0);
            assert.strictEqual(optCheck.domState.appReady, true);
            assert.strictEqual(optCheck.domState.catalogReady, true);
            assert.strictEqual(optCheck.domState.brokenImgs.length, 0);
            assert.strictEqual(optCheck.domState.kpiCount, 4);
            assert.strictEqual(optCheck.visibleCardsAfterFilter, 1);
            assert.ok(origCheck.measuredInputMb > 10, `Expected original measured MB > 10, got ${origCheck.measuredInputMb}`);
            assert.ok(optCheck.measuredInputMb > 0 && optCheck.measuredInputMb < 0.5, `Expected optimized measured MB < 0.5, got ${optCheck.measuredInputMb}`);
            assert.ok(optCheck.updatedEstimator.includes('Estimated monthly transfer:'));
            assert.notStrictEqual(origCheck.updatedEstimator, optCheck.updatedEstimator);
            assert.ok(optCheck.networkBytes < origCheck.networkBytes);
            assert.ok(optCheck.networkRequests < origCheck.networkRequests);

            module3BrowserCheck = { original: origCheck, optimized: optCheck };
        } finally {
            await browser.close();
            server.close();
        }
    });

    // -------------------------------------------------------------------------
    // PRINT DEMONSTRATION ARTIFACTS & SUMMARY
    // -------------------------------------------------------------------------
    console.log('\n==================== DEMONSTRATION OUTPUTS ====================');
    console.log('\n[DEMO 1A — Module 1 Valid AI Agent Output]');
    console.log(JSON.stringify({
        generationMode: module1ValidDemo.generationMode,
        provenance: module1ValidDemo.provenance,
        overallAssessment: module1ValidDemo.overallAssessment,
        firstRecommendation: module1ValidDemo.recommendations[0],
    }, null, 2));

    console.log('\n[DEMO 1B — Module 1 Deterministic Fallback (429 Rate Limit)]');
    console.log(JSON.stringify({
        generationMode: module1FallbackDemo.generationMode,
        fallbackReason: module1FallbackDemo.fallbackReason,
        recommendationsCount: module1FallbackDemo.recommendations.length,
        priorities: module1FallbackDemo.recommendations.map((r) => `${r.priority}: ${r.issueIdentified}`),
    }, null, 2));

    console.log('\n[DEMO 2 — Module 2 What-if Combined Simulation Output]');
    console.log(JSON.stringify({
        resultType: module2Demo.resultType,
        baseline: {
            pageWeightMB: module2Demo.baseline.pageWeightMB,
            totalBytes: module2Demo.baseline.totalBytes,
            energyUsedKWh: module2Demo.baseline.energyUsedKWh,
            co2EstimateGrams: module2Demo.baseline.co2EstimateGramsPrecise,
            carbonScore: module2Demo.baseline.carbonScore,
            totalRequests: module2Demo.baseline.totalRequests,
        },
        simulated: {
            pageWeightMB: module2Demo.simulated.pageWeightMB,
            totalBytes: module2Demo.simulated.totalBytes,
            energyUsedKWh: module2Demo.simulated.energyUsedKWh,
            co2EstimateGrams: module2Demo.simulated.co2EstimateGramsPrecise,
            carbonScore: module2Demo.simulated.carbonScore,
            totalRequests: module2Demo.simulated.totalRequests,
        },
        comparison: module2Demo.comparison,
    }, null, 2));

    console.log('\n[DEMO 3A — Module 3 Actual Optimization Summary & File Table]');
    console.log(JSON.stringify(module3RunResult.summary, null, 2));
    console.table(
        module3RunResult.operations.map((op) => ({
            category: op.category,
            status: op.status,
            originalFile: op.originalFile,
            optimizedFile: op.optimizedFile,
            origKB: (op.originalBytes / 1024).toFixed(2),
            optKB: (op.optimizedBytes / 1024).toFixed(2),
            reductionPct: `${op.reductionPct}%`,
        }))
    );

    console.log('\n[DEMO 3B — Module 3 Live Playwright Browser Verification]');
    console.log(JSON.stringify({
        original: {
            requests: module3BrowserCheck.original.networkRequests,
            transferredBytes: module3BrowserCheck.original.networkBytes,
            brokenImages: module3BrowserCheck.original.domState.brokenImgs.length,
            consoleErrors: module3BrowserCheck.original.consoleErrors.length,
            filterWorkedCards: module3BrowserCheck.original.visibleCardsAfterFilter,
        },
        optimized: {
            requests: module3BrowserCheck.optimized.networkRequests,
            transferredBytes: module3BrowserCheck.optimized.networkBytes,
            brokenImages: module3BrowserCheck.optimized.domState.brokenImgs.length,
            consoleErrors: module3BrowserCheck.optimized.consoleErrors.length,
            filterWorkedCards: module3BrowserCheck.optimized.visibleCardsAfterFilter,
            estimatorLiveText: module3BrowserCheck.optimized.updatedEstimator,
        },
    }, null, 2));

    console.log('\n======================================================================');
    console.log(`TEST SUMMARY: ${results.passed} passed, ${results.failed} failed`);
    console.log('======================================================================\n');

    if (results.failed > 0) {
        process.exit(1);
    }
}

run().catch((err) => {
    console.error('Fatal verification error:', err);
    process.exit(1);
});
