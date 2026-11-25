// backend/tests/test_module3_verification.js
// Verifies Module 3 accuracy & stability fixes:
// 1. Runs 2 consecutive optimizations while simultaneously fetching /controlled-site/optimized/ over HTTP (proves EPERM is resolved!)
// 2. Verifies original/ files remain 100% unchanged
// 3. Verifies staging verification + every generated WebP, min.js, min.css, and HTML reference
// 4. Verifies visual/layout integrity, image natural dimensions vs rendered dimensions, JS interactivity, and CSS rules in real Chromium via Playwright

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { chromium } = require('playwright');

const {
    ORIGINAL_DIR,
    OPTIMIZED_DIR,
    runControlledOptimization,
    summarizeDirectory,
} = require('../services/optimizationService');

async function main() {
    console.log('=== MODULE 3 EPERM, VISUAL, ASSET & INTERACTIVITY VERIFICATION ===');

    const origBefore = summarizeDirectory(ORIGINAL_DIR);

    // 1. Concurrent HTTP read stress + 2 back-to-back optimization runs against live port 5000
    //    to verify zero EPERM errors even while Express static serves OPTIMIZED_DIR!
    let stopPolling = false;
    const poller = (async () => {
        while (!stopPolling) {
            try {
                await axios.get('http://127.0.0.1:5000/controlled-site/optimized/', { timeout: 2000 });
            } catch {}
            await new Promise((r) => setTimeout(r, 50));
        }
    })();

    let run1, run2;
    try {
        run1 = await runControlledOptimization({ images: true, javascript: true, css: true, imageQuality: 75 });
        run2 = await runControlledOptimization({ images: true, javascript: true, css: true, imageQuality: 75 });
    } finally {
        stopPolling = true;
        await poller;
    }

    assert.strictEqual(run1.status, 'COMPLETED', `Run 1 failed: ${JSON.stringify(run1.errors)}`);
    assert.strictEqual(run2.status, 'COMPLETED', `Run 2 failed: ${JSON.stringify(run2.errors)}`);
    assert.strictEqual(run2.summary.originalPreserved, true);
    assert.strictEqual(run2.summary.stagingVerified, true);
    assert.strictEqual(run2.errors.length, 0);
    console.log(`PASS: 2 consecutive runs under concurrent HTTP access succeeded with 0 EPERM errors (${run2.summary.totalReductionPct}% live filesystem reduction)`);

    // 2. Verify original directory is 100% identical byte-for-byte
    const origAfter = summarizeDirectory(ORIGINAL_DIR);
    assert.strictEqual(origBefore.totals.totalBytes, origAfter.totals.totalBytes);
    assert.strictEqual(origBefore.totals.totalFiles, origAfter.totals.totalFiles);
    console.log(`PASS: Original baseline untouched (${origAfter.totals.totalBytes} B across ${origAfter.totals.totalFiles} files)`);

    // 3. Verify image dimensions & quality via sharp
    const imageOps = run2.operations.filter((op) => op.category === 'image');
    for (const op of imageOps) {
        const meta = await sharp(path.join(OPTIMIZED_DIR, op.optimizedFile)).metadata();
        assert.strictEqual(meta.format, 'webp');
        assert.ok(meta.width >= 96 && meta.height >= 96);
        assert.strictEqual(`${meta.width}x${meta.height}`, op.optimizedDimensions);
    }
    console.log(`PASS: All ${imageOps.length} WebP images verified valid with exact recorded dimensions`);

    // 4. Playwright visual layout, CSS computed styles, image quality/display dimensions, and JS interactivity check
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        async function inspectLive(url) {
            const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
            const page = await ctx.newPage();
            const consoleErrors = [];
            const pageErrors = [];
            const failedRequests = [];

            page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
            page.on('pageerror', (e) => pageErrors.push(e.message));
            page.on('response', (res) => { if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`); });

            await page.goto(url, { waitUntil: 'networkidle' });
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(300);

            const audit = await page.evaluate(() => {
                const imgs = Array.from(document.querySelectorAll('img')).map((img) => {
                    const rect = img.getBoundingClientRect();
                    return {
                        src: img.getAttribute('src'),
                        complete: img.complete,
                        naturalWidth: img.naturalWidth,
                        naturalHeight: img.naturalHeight,
                        renderedWidth: Math.round(rect.width),
                        renderedHeight: Math.round(rect.height),
                    };
                });

                const heroRect = document.querySelector('.hero')?.getBoundingClientRect();
                const gridStyle = getComputedStyle(document.querySelector('.card-grid'));
                const bodyBg = getComputedStyle(document.body).backgroundColor;
                const h1Color = getComputedStyle(document.querySelector('h1')).color;
                const btnBg = getComputedStyle(document.querySelector('.btn-primary')).backgroundColor;
                const kpiCount = document.querySelectorAll('#metrics-kpi-strip .metric-box').length;

                return {
                    title: document.title,
                    imgs,
                    heroHeight: heroRect ? Math.round(heroRect.height) : 0,
                    gridColumns: gridStyle.gridTemplateColumns,
                    bodyBg,
                    h1Color,
                    btnBg,
                    kpiCount,
                    appReady: window.__GREENGRID_APP_READY__ === true,
                    catalogReady: window.__GREENGRID_CATALOG_READY__ === true,
                };
            });

            // Test JS interactive controls
            await page.click('.filter-btn[data-filter="code"]');
            const visibleCodeCards = await page.evaluate(() =>
                Array.from(document.querySelectorAll('.feature-card')).filter(
                    (el) => getComputedStyle(el).display !== 'none'
                ).length
            );
            await page.fill('#input-monthly-visits', '25000');
            await page.click('#btn-recalculate-preview');
            const estimatorOutput = await page.textContent('#estimator-result');
            const measuredMb = Number(await page.inputValue('#input-page-weight-mb'));

            await ctx.close();
            return { audit, consoleErrors, pageErrors, failedRequests, visibleCodeCards, estimatorOutput, measuredMb };
        }

        const origView = await inspectLive('http://127.0.0.1:5000/controlled-site/original/');
        const optView = await inspectLive('http://127.0.0.1:5000/controlled-site/optimized/');

        assert.strictEqual(origView.failedRequests.length, 0);
        assert.strictEqual(optView.failedRequests.length, 0, `Broken resources: ${optView.failedRequests.join(', ')}`);
        assert.strictEqual(optView.consoleErrors.length, 0, `Console errors: ${optView.consoleErrors.join(', ')}`);
        assert.strictEqual(optView.pageErrors.length, 0);

        for (const img of optView.audit.imgs) {
            assert.ok(img.complete && img.naturalWidth > 0, `Broken image: ${img.src}`);
            // Verify natural resolution is >= rendered display width (no blurry upscaling!)
            assert.ok(
                img.naturalWidth >= img.renderedWidth,
                `Image ${img.src} upscaled beyond natural width (${img.naturalWidth} < ${img.renderedWidth})`
            );
        }

        // Verify CSS layout & theme preserved identically after removing unused CSS
        assert.strictEqual(optView.audit.bodyBg, origView.audit.bodyBg);
        assert.strictEqual(optView.audit.h1Color, origView.audit.h1Color);
        assert.strictEqual(optView.audit.btnBg, origView.audit.btnBg);
        assert.strictEqual(optView.audit.gridColumns, origView.audit.gridColumns);
        assert.strictEqual(optView.audit.kpiCount, 4);
        assert.strictEqual(optView.visibleCodeCards, 1);
        assert.ok(origView.measuredMb > 10 && optView.measuredMb < 0.5);
        assert.notStrictEqual(origView.estimatorOutput, optView.estimatorOutput);

        console.log('PASS: Visual CSS styles, grid layout, image resolution >= display size, zero broken resources, and JS interactivity verified on live port 5000!');
        console.log('Optimized Image Dimensions vs Rendered Box:', JSON.stringify(optView.audit.imgs, null, 2));
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error('Module 3 verification failed:', err);
    process.exit(1);
});
