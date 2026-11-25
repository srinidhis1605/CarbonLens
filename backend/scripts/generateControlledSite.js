// backend/scripts/generateControlledSite.js
// Generates the immutable baseline controlled test website inside research/test-website/original/
// Includes genuine high-resolution raster PNG/JPEG images, realistic unminified JS/CSS,
// and genuinely unused legacy JS/CSS files for Module 3 & Module 4 optimization experiments.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ORIGINAL_DIR = path.resolve(__dirname, '../../research/test-website/original');
const IMAGES_DIR = path.join(ORIGINAL_DIR, 'assets/images');
const JS_DIR = path.join(ORIGINAL_DIR, 'assets/js');
const CSS_DIR = path.join(ORIGINAL_DIR, 'assets/css');

/**
 * Deterministic PRNG (Mulberry32) so generated baseline images are 100% reproducible
 * while containing realistic photographic-like multi-frequency detail and textures.
 */
function createRng(seed) {
    let a = seed >>> 0;
    return function next() {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Generates a realistic detailed raster image (landscape/gradient/waveforms/texture)
 * and writes it as an intentionally unoptimized high-res PNG or quality-100 JPEG.
 */
async function generateDetailedImage({ filePath, width, height, palette, seed, format = 'png' }) {
    const rng = createRng(seed);
    const channels = 3;
    const buf = Buffer.alloc(width * height * channels);

    for (let y = 0; y < height; y++) {
        const ny = y / height;
        for (let x = 0; x < width; x++) {
            const nx = x / width;
            const wave1 = Math.sin(nx * 14 + ny * 6) * 0.5 + 0.5;
            const wave2 = Math.cos(nx * 29 - ny * 17) * 0.5 + 0.5;
            const radial = Math.sqrt((nx - 0.35) ** 2 + (ny - 0.4) ** 2);
            const grain = (rng() - 0.5) * 34; // realistic photographic sensor detail

            // Smooth sky/terrain/eco-data-viz composition
            let r = palette.bg1[0] * (1 - ny) + palette.bg2[0] * ny;
            let g = palette.bg1[1] * (1 - ny) + palette.bg2[1] * ny;
            let b = palette.bg1[2] * (1 - ny) + palette.bg2[2] * ny;

            // Overlay luminous accent wave + subtle grid lines
            const accentMix = Math.max(0, 0.45 - radial) * 0.9 + wave1 * 0.18 + wave2 * 0.08;
            r = r * (1 - accentMix * 0.5) + palette.accent[0] * accentMix * 0.5;
            g = g * (1 - accentMix * 0.5) + palette.accent[1] * accentMix * 0.5;
            b = b * (1 - accentMix * 0.5) + palette.accent[2] * accentMix * 0.5;

            if (x % 96 === 0 || y % 96 === 0) {
                r += 16;
                g += 18;
                b += 16;
            }

            const idx = (y * width + x) * channels;
            buf[idx] = Math.max(0, Math.min(255, Math.round(r + grain)));
            buf[idx + 1] = Math.max(0, Math.min(255, Math.round(g + grain)));
            buf[idx + 2] = Math.max(0, Math.min(255, Math.round(b + grain)));
        }
    }

    const pipeline = sharp(buf, { raw: { width, height, channels } });
    if (format === 'jpeg') {
        await pipeline.jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toFile(filePath);
    } else {
        // Uncompressed / minimal-compression PNG (intentionally unoptimized baseline)
        await pipeline.png({ compressionLevel: 1, adaptiveFiltering: false }).toFile(filePath);
    }
}

function buildOriginalStylesCss() {
    const base = `/* ==========================================================================
   GreenGrid Digital Sustainability Showcase — Main Stylesheet (Unminified Baseline)
   This stylesheet intentionally contains verbose documentation comments,
   uncollapsed whitespace, and redundant utility definitions for controlled
   before-and-after optimization testing in CarbonLens 2.0.
   ========================================================================== */

:root {
    --brand-primary: #15803d;
    --brand-secondary: #16a34a;
    --brand-accent: #0f766e;
    --surface-page: #f8fafc;
    --surface-card: #ffffff;
    --border-subtle: #e2e8f0;
    --text-primary: #0f172a;
    --text-secondary: #475569;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    background-color: var(--surface-page);
    color: var(--text-primary);
    line-height: 1.65;
}

.site-header {
    background-color: #ffffff;
    border-bottom: 1px solid var(--border-subtle);
    padding: 18px 24px;
    position: sticky;
    top: 0;
    z-index: 20;
}

.header-inner {
    max-width: 1180px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.brand-mark {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    font-size: 1.15rem;
    color: var(--brand-primary);
}

.nav-links {
    display: flex;
    gap: 20px;
    list-style: none;
}

.nav-links a {
    text-decoration: none;
    color: var(--text-secondary);
    font-weight: 500;
    font-size: 0.95rem;
}

.nav-links a:hover {
    color: var(--brand-primary);
}

.container {
    max-width: 1180px;
    margin: 0 auto;
    padding: 36px 24px;
}

.hero {
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    gap: 32px;
    align-items: center;
    background: #ffffff;
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    padding: 32px;
    margin-bottom: 36px;
}

.hero h1 {
    font-size: 2.2rem;
    line-height: 1.2;
    margin-bottom: 14px;
}

.hero p {
    color: var(--text-secondary);
    margin-bottom: 20px;
}

.hero-image {
    width: 100%;
    height: auto;
    border-radius: 12px;
    display: block;
    object-fit: cover;
}

.btn-primary {
    display: inline-block;
    background-color: var(--brand-secondary);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    padding: 10px 18px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
}

.btn-primary:hover {
    background-color: var(--brand-primary);
}

.section-title {
    font-size: 1.5rem;
    margin-bottom: 16px;
    color: var(--text-primary);
}

.card-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-bottom: 36px;
}

.feature-card {
    background: var(--surface-card);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.feature-card img {
    width: 100%;
    height: 190px;
    object-fit: cover;
    display: block;
}

.feature-card-body {
    padding: 16px;
}

.feature-card h3 {
    font-size: 1.05rem;
    margin-bottom: 8px;
}

.feature-card p {
    font-size: 0.9rem;
    color: var(--text-secondary);
}

.filter-bar {
    display: flex;
    gap: 10px;
    margin-bottom: 18px;
    flex-wrap: wrap;
}

.filter-btn {
    background: #ffffff;
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    padding: 7px 14px;
    font-size: 0.85rem;
    cursor: pointer;
    color: var(--text-secondary);
}

.filter-btn.active {
    background: var(--brand-primary);
    color: #ffffff;
    border-color: var(--brand-primary);
}

.estimator-panel {
    background: #ffffff;
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    padding: 24px;
    margin-bottom: 36px;
}

.estimator-controls {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-top: 16px;
}

.estimator-controls label {
    display: block;
    font-size: 0.85rem;
    color: var(--text-secondary);
    margin-bottom: 6px;
}

.estimator-controls input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
}

.estimator-output {
    margin-top: 18px;
    padding: 14px;
    border-radius: 10px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #14532d;
    font-weight: 600;
}

.site-footer {
    border-top: 1px solid var(--border-subtle);
    background: #ffffff;
    padding: 24px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.85rem;
}

@media (max-width: 900px) {
    .hero, .card-grid, .estimator-controls {
        grid-template-columns: 1fr;
    }
}
`;
    // Append realistic verbose documentation and redundant unminified helper classes
    let extra = '\n/* Verbose spacing and layout helper library (unminified baseline) */\n';
    for (let i = 1; i <= 180; i++) {
        extra += `
/* Utility rule block #${i} — intentionally unminified for controlled CSS optimization benchmark */
.gg-legacy-helper-block-${i} {
    margin-top: ${(i % 12) * 2}px;
    margin-bottom: ${(i % 10) * 2}px;
    padding-left: ${(i % 8) * 4}px;
    padding-right: ${(i % 8) * 4}px;
    border-radius: ${(i % 6) * 2}px;
    letter-spacing: 0.01em;
}
`;
    }
    return base + extra;
}

function buildOriginalComponentsCss() {
    let css = `/* ==========================================================================
   GreenGrid Components Stylesheet (Unminified Baseline)
   ========================================================================== */

.badge-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 600;
    background: #dcfce7;
    color: #166534;
    margin-bottom: 12px;
}

.metrics-strip {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 32px;
}

.metric-box {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px;
}

.metric-box .label {
    font-size: 0.78rem;
    text-transform: uppercase;
    color: #64748b;
}

.metric-box .val {
    font-size: 1.35rem;
    font-weight: 700;
    margin-top: 4px;
    color: #0f172a;
}

.gallery-row {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    margin-bottom: 36px;
}

.gallery-row img {
    width: 100%;
    height: 240px;
    object-fit: cover;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
}
`;
    for (let i = 1; i <= 140; i++) {
        css += `
/* Component variant rule #${i} — verbose multi-line formatting */
.gg-unused-component-variant-${i} {
    background-color: #f8fafc;
    border-color: #cbd5e1;
    border-width: 1px;
    border-style: solid;
    color: #334155;
    padding-top: ${(i % 5) * 4}px;
    padding-bottom: ${(i % 5) * 4}px;
}
`;
    }
    return css;
}

function buildUnusedLegacyCss() {
    let css = `/* ==========================================================================
   LEGACY UNUSED PRINT & CAROUSEL THEME STYLESHEET
   Intentionally loaded on the original controlled website but unused by any DOM element.
   Eligible for safe removal during Module 3 CSS optimization.
   ========================================================================== */\n`;
    for (let i = 1; i <= 260; i++) {
        css += `
/* Deprecated carousel slide theme #${i} (unused in current page layout) */
.deprecated-carousel-v1-slide-${i},
.deprecated-carousel-v1-caption-${i} {
    position: relative;
    display: block;
    background-color: #ffffff;
    color: #1e293b;
    padding: 12px 16px 12px 16px;
    margin: 4px 8px 4px 8px;
    box-shadow: 0 2px 4px rgba(15, 23, 42, 0.08);
    transition: transform 0.25s ease-in-out, opacity 0.25s ease-in-out;
}
`;
    }
    return css;
}

function buildOriginalAppJs() {
    return `/**
 * ============================================================================
 * GreenGrid Interactive Portal — Primary Application Script (Unminified Baseline)
 * Handles interactive category filtering and dynamic traffic footprint preview.
 * This functionality MUST continue working identically after JS optimization.
 * ============================================================================
 */
(function initializeGreenGridPortal() {
    'use strict';

    /**
     * Filters sustainability showcase cards by category tag.
     * @param {string} selectedCategory
     */
    function applyCategoryFilter(selectedCategory) {
        var allCards = document.querySelectorAll('.feature-card');
        var visibleCount = 0;

        for (var index = 0; index < allCards.length; index++) {
            var cardElement = allCards[index];
            var cardCategory = cardElement.getAttribute('data-category') || 'all';
            if (selectedCategory === 'all' || cardCategory === selectedCategory) {
                cardElement.style.display = 'flex';
                visibleCount += 1;
            } else {
                cardElement.style.display = 'none';
            }
        }

        var statusBadge = document.getElementById('filter-status-text');
        if (statusBadge) {
            statusBadge.textContent = 'Showing ' + visibleCount + ' sustainability initiative(s)';
        }
    }

    /**
     * Reads real browser-measured page transfer/body weight for the currently served site version
     * using Navigation + Resource Timing APIs (zero hardcoded default MB).
     */
    function detectMeasuredPageWeightMb() {
        try {
            var navEntries = performance.getEntriesByType('navigation') || [];
            var resEntries = performance.getEntriesByType('resource') || [];
            var totalBytes = 0;
            var countedResources = 0;

            for (var i = 0; i < navEntries.length; i++) {
                var navSize = navEntries[i].transferSize || navEntries[i].encodedBodySize || navEntries[i].decodedBodySize || 0;
                totalBytes += navSize;
                if (navSize > 0) countedResources += 1;
            }
            for (var j = 0; j < resEntries.length; j++) {
                var resSize = resEntries[j].transferSize || resEntries[j].encodedBodySize || resEntries[j].decodedBodySize || 0;
                totalBytes += resSize;
                if (resSize > 0) countedResources += 1;
            }

            if (totalBytes <= 0) return null;
            return {
                totalBytes: totalBytes,
                pageWeightMb: totalBytes / (1024 * 1024),
                resourceCount: countedResources
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Computes an educational energy/CO2 estimate for monthly visitor volume
     * using the measured page weight of the currently loaded website version.
     */
    function recalculateFootprintPreview() {
        var visitsInput = document.getElementById('input-monthly-visits');
        var weightInput = document.getElementById('input-page-weight-mb');
        var outputElement = document.getElementById('estimator-result');
        var sourceNotice = document.getElementById('estimator-source-notice');

        if (!visitsInput || !weightInput || !outputElement) {
            return;
        }

        var measured = detectMeasuredPageWeightMb();
        if ((!weightInput.value || weightInput.dataset.autoDetected !== 'false') && measured) {
            weightInput.value = measured.pageWeightMb.toFixed(4);
            weightInput.dataset.autoDetected = 'true';
        }

        if (sourceNotice) {
            sourceNotice.textContent = measured
                ? 'Measured in browser Performance API: ' +
                  measured.pageWeightMb.toFixed(4) +
                  ' MB (' +
                  measured.totalBytes.toLocaleString() +
                  ' bytes across ' +
                  measured.resourceCount +
                  ' loaded resource(s))'
                : 'Awaiting browser resource timing measurements...';
        }

        var monthlyVisits = Math.max(0, Number(visitsInput.value) || 0);
        var pageWeightMb = Number(weightInput.value);
        if (!Number.isFinite(pageWeightMb) || pageWeightMb <= 0) {
            outputElement.textContent = 'Measured page weight unavailable yet.';
            return;
        }

        // Uses CarbonLens documented educational formula constants: 0.06 kWh/GB and 442 gCO2/kWh
        var totalTransferGb = (monthlyVisits * pageWeightMb) / 1024;
        var estimatedEnergyKwh = totalTransferGb * 0.06;
        var estimatedCo2Kg = (estimatedEnergyKwh * 442) / 1000;

        outputElement.textContent =
            'Estimated monthly transfer: ' +
            totalTransferGb.toFixed(2) +
            ' GB | Calculated energy estimate: ' +
            estimatedEnergyKwh.toFixed(4) +
            ' kWh | Calculated CO2 estimate: ' +
            estimatedCo2Kg.toFixed(4) +
            ' kg CO2';
    }

    function bindInteractiveControls() {
        var filterButtons = document.querySelectorAll('.filter-btn');
        for (var i = 0; i < filterButtons.length; i++) {
            filterButtons[i].addEventListener('click', function onFilterClick(event) {
                var chosenCategory = event.currentTarget.getAttribute('data-filter') || 'all';
                for (var j = 0; j < filterButtons.length; j++) {
                    filterButtons[j].classList.remove('active');
                }
                event.currentTarget.classList.add('active');
                applyCategoryFilter(chosenCategory);
            });
        }

        var weightInput = document.getElementById('input-page-weight-mb');
        if (weightInput) {
            weightInput.addEventListener('input', function onManualWeightInput() {
                weightInput.dataset.autoDetected = 'false';
            });
        }

        var calcButton = document.getElementById('btn-recalculate-preview');
        if (calcButton) {
            calcButton.addEventListener('click', recalculateFootprintPreview);
        }

        applyCategoryFilter('all');
        recalculateFootprintPreview();
        window.addEventListener('load', function onFullLoad() {
            setTimeout(recalculateFootprintPreview, 100);
        });
        window.__GREENGRID_APP_READY__ = true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindInteractiveControls);
    } else {
        bindInteractiveControls();
    }
})();
`;
}

function buildVerboseCatalogJs() {
    let code = `/**
 * ============================================================================
 * GreenGrid Metrics Catalog Helper (Unminified Baseline with Verbose Comments)
 * Renders summary KPI strip and intentionally includes verbose formatting,
 * documentation blocks, and unreachable helper branches for Terser minification.
 * ============================================================================
 */
(function registerSustainabilityCatalog() {
    'use strict';

    var sustainabilityKpis = [
        { key: 'kpi-target-budget', label: 'Target Page Budget', value: '< 1.0 MB' },
        { key: 'kpi-image-format', label: 'Recommended Image Format', value: 'WebP / AVIF' },
        { key: 'kpi-script-policy', label: 'Script Delivery Policy', value: 'Minified + Deferred' },
        { key: 'kpi-css-policy', label: 'Stylesheet Policy', value: 'Purged + Minified' }
    ];

    function hydrateKpiStrip() {
        var container = document.getElementById('metrics-kpi-strip');
        if (!container) return;
        container.innerHTML = '';
        for (var idx = 0; idx < sustainabilityKpis.length; idx++) {
            var item = sustainabilityKpis[idx];
            var box = document.createElement('div');
            box.className = 'metric-box';
            box.setAttribute('data-kpi-key', item.key);
            box.innerHTML =
                '<div class="label">' + item.label + '</div>' +
                '<div class="val">' + item.value + '</div>';
            container.appendChild(box);
        }
        window.__GREENGRID_CATALOG_READY__ = true;
    }

    // Verbose internal benchmark notes & unreachable dead-code functions for genuine dead-code elimination
    if (false) {
        console.log('Dead code branch that Terser eliminates safely.');
    }
`;
    for (let i = 1; i <= 140; i++) {
        code += `
    /**
     * Verbose documentation block for internal reference table row ${i}.
     * Contains multi-line explanation comments stripped cleanly during minification.
     */
    function internalDeadHelperNumber${i}(inputMeasurementValue) {
        var normalizedDiagnosticValue = Number(inputMeasurementValue) || ${i};
        return normalizedDiagnosticValue * 1.0 + ${i % 7};
    }
`;
    }
    code += `
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hydrateKpiStrip);
    } else {
        hydrateKpiStrip();
    }
})();
`;
    return code;
}

function buildUnusedLegacyJs() {
    let code = `/**
 * ============================================================================
 * LEGACY UNUSED WIDGET SCRIPT (Intentionally unused on current page)
 * Simulates forgotten third-party / legacy bundle still shipped in HTML <head>.
 * Eligible for safe removal in Module 3 JavaScript optimization.
 * ============================================================================
 */
(function legacyUnusedWidgetModule() {
    'use strict';
    var deprecatedLookupTable = [];
`;
    for (let i = 1; i <= 320; i++) {
        code += `    deprecatedLookupTable.push({ id: "LEGACY_WIDGET_NODE_${i}", description: "Deprecated telemetry record entry number ${i} no longer rendered in UI", weightFactor: ${(i * 0.13).toFixed(2)} });\n`;
    }
    code += `
    window.__LEGACY_UNUSED_REGISTRY_COUNT__ = deprecatedLookupTable.length;
})();
`;
    return code;
}

function buildOriginalHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GreenGrid Analytics — CarbonLens Controlled Test Website (Original)</title>
    <meta name="description" content="Controlled test website for CarbonLens 2.0 real optimization and before-and-after validation experiments." />
    <link rel="stylesheet" href="assets/css/styles.css" />
    <link rel="stylesheet" href="assets/css/components.css" />
    <link rel="stylesheet" href="assets/css/legacy-print-unused.css" data-carbonlens-unused="true" />
    <script src="assets/js/legacy-unused-widget.js" data-carbonlens-unused="true"></script>
</head>
<body>
    <header class="site-header">
        <div class="header-inner">
            <div class="brand-mark">
                <img src="assets/images/badge-partner.png" alt="GreenGrid Eco Badge" width="36" height="36" style="border-radius: 8px; object-fit: cover;" />
                <span>GreenGrid Sustainability Portal</span>
            </div>
            <ul class="nav-links">
                <li><a href="#overview">Overview</a></li>
                <li><a href="#initiatives">Initiatives</a></li>
                <li><a href="#gallery">Infrastructure</a></li>
                <li><a href="#estimator">Estimator</a></li>
            </ul>
        </div>
    </header>

    <main class="container">
        <section id="overview" class="hero">
            <div>
                <span class="badge-pill">Controlled Research Baseline Website</span>
                <h1>Sustainable Web Engineering &amp; Digital Carbon Reduction</h1>
                <p>
                    This controlled website serves as the immutable baseline for CarbonLens 2.0 actual optimization
                    demonstrations. It ships intentionally unoptimized high-resolution raster images, unminified
                    stylesheets and scripts, and unused legacy assets so real optimization savings can be measured
                    before and after via Playwright.
                </p>
                <a href="#estimator" class="btn-primary">Explore Footprint Estimator</a>
            </div>
            <div>
                <img src="assets/images/hero-banner.png" alt="Sustainable green energy digital grid hero banner" class="hero-image" />
            </div>
        </section>

        <section id="metrics-kpi-strip" class="metrics-strip" aria-label="Sustainability KPIs"></section>

        <section id="initiatives">
            <h2 class="section-title">Web Optimization Focus Areas</h2>
            <div class="filter-bar">
                <button type="button" class="filter-btn active" data-filter="all">All Areas</button>
                <button type="button" class="filter-btn" data-filter="images">Image Delivery</button>
                <button type="button" class="filter-btn" data-filter="code">JavaScript &amp; CSS</button>
                <button type="button" class="filter-btn" data-filter="infra">Green Infrastructure</button>
            </div>
            <p id="filter-status-text" style="font-size: 0.85rem; color: #475569; margin-bottom: 14px;"></p>

            <div class="card-grid">
                <article class="feature-card" data-category="images">
                    <img src="assets/images/solar-campus.jpg" alt="Solar powered digital campus" />
                    <div class="feature-card-body">
                        <h3>Modern Image Formats</h3>
                        <p>Converting oversized PNG and JPEG photographs to resized WebP assets dramatically reduces network transfer bytes.</p>
                    </div>
                </article>
                <article class="feature-card" data-category="code">
                    <img src="assets/images/dashboard-preview.png" alt="Carbon analytics dashboard preview" />
                    <div class="feature-card-body">
                        <h3>Lean JavaScript &amp; CSS</h3>
                        <p>Minifying active bundles and eliminating unused legacy scripts and stylesheets lowers transfer weight and CPU work.</p>
                    </div>
                </article>
                <article class="feature-card" data-category="infra">
                    <img src="assets/images/datacenter-overview.png" alt="Efficient green data center overview" />
                    <div class="feature-card-body">
                        <h3>Renewable Hosting Awareness</h3>
                        <p>Combining lean frontend architecture with verified renewable-energy hosting minimizes estimated digital emissions.</p>
                    </div>
                </article>
            </div>
        </section>

        <section id="gallery">
            <h2 class="section-title">Visual Research Assets</h2>
            <div class="gallery-row">
                <img src="assets/images/efficiency-report.png" alt="Digital sustainability efficiency report graphic" />
                <img src="assets/images/grid-network.jpg" alt="Low carbon global network infrastructure visual" />
            </div>
        </section>

        <section id="estimator" class="estimator-panel">
            <h2 class="section-title" style="margin-bottom: 6px;">Interactive Traffic Footprint Preview</h2>
            <p style="font-size: 0.9rem; color: #475569;">
                Verifies that client-side JavaScript remains fully interactive after minification and unused-script removal.
            </p>
            <div class="estimator-controls">
                <div>
                    <label for="input-monthly-visits">Monthly Page Views</label>
                    <input id="input-monthly-visits" type="number" value="10000" min="100" />
                </div>
                <div>
                    <label for="input-page-weight-mb">Measured Page Weight (MB)</label>
                    <input id="input-page-weight-mb" type="number" step="0.0001" value="" placeholder="Auto-measured" min="0.0001" />
                </div>
                <div style="display: flex; align-items: flex-end;">
                    <button id="btn-recalculate-preview" type="button" class="btn-primary" style="width: 100%;">
                        Recalculate Estimate
                    </button>
                </div>
            </div>
            <p id="estimator-source-notice" style="font-size: 0.8rem; color: #475569; margin-top: 10px;"></p>
            <div id="estimator-result" class="estimator-output"></div>
        </section>
    </main>

    <footer class="site-footer">
        CarbonLens 2.0 Controlled Test Website — Original Unoptimized Baseline (Immutable)
    </footer>

    <script src="assets/js/data-catalog.js"></script>
    <script src="assets/js/app.js"></script>
</body>
</html>
`;
}

async function generateControlledTestWebsite({ force = false } = {}) {
    const indexPath = path.join(ORIGINAL_DIR, 'index.html');
    if (fs.existsSync(indexPath) && !force) {
        return { created: false, path: ORIGINAL_DIR };
    }

    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    fs.mkdirSync(JS_DIR, { recursive: true });
    fs.mkdirSync(CSS_DIR, { recursive: true });

    const imageSpecs = [
        {
            name: 'hero-banner.png',
            width: 1800,
            height: 1012,
            format: 'png',
            seed: 101,
            palette: { bg1: [12, 74, 54], bg2: [22, 163, 74], accent: [187, 247, 208] },
        },
        {
            name: 'dashboard-preview.png',
            width: 1440,
            height: 900,
            format: 'png',
            seed: 202,
            palette: { bg1: [15, 23, 42], bg2: [30, 64, 175], accent: [56, 189, 248] },
        },
        {
            name: 'datacenter-overview.png',
            width: 1440,
            height: 900,
            format: 'png',
            seed: 303,
            palette: { bg1: [17, 94, 89], bg2: [20, 83, 45], accent: [134, 239, 172] },
        },
        {
            name: 'efficiency-report.png',
            width: 1400,
            height: 860,
            format: 'png',
            seed: 404,
            palette: { bg1: [30, 41, 59], bg2: [15, 118, 110], accent: [250, 204, 21] },
        },
        {
            name: 'solar-campus.jpg',
            width: 1600,
            height: 1000,
            format: 'jpeg',
            seed: 505,
            palette: { bg1: [2, 132, 199], bg2: [21, 128, 61], accent: [253, 224, 71] },
        },
        {
            name: 'grid-network.jpg',
            width: 1600,
            height: 1000,
            format: 'jpeg',
            seed: 606,
            palette: { bg1: [30, 27, 75], bg2: [6, 95, 70], accent: [52, 211, 153] },
        },
        {
            name: 'badge-partner.png',
            width: 600,
            height: 600,
            format: 'png',
            seed: 707,
            palette: { bg1: [21, 128, 61], bg2: [22, 101, 52], accent: [220, 252, 231] },
        },
    ];

    for (const spec of imageSpecs) {
        await generateDetailedImage({
            filePath: path.join(IMAGES_DIR, spec.name),
            width: spec.width,
            height: spec.height,
            palette: spec.palette,
            seed: spec.seed,
            format: spec.format,
        });
    }

    fs.writeFileSync(path.join(CSS_DIR, 'styles.css'), buildOriginalStylesCss(), 'utf8');
    fs.writeFileSync(path.join(CSS_DIR, 'components.css'), buildOriginalComponentsCss(), 'utf8');
    fs.writeFileSync(path.join(CSS_DIR, 'legacy-print-unused.css'), buildUnusedLegacyCss(), 'utf8');

    fs.writeFileSync(path.join(JS_DIR, 'app.js'), buildOriginalAppJs(), 'utf8');
    fs.writeFileSync(path.join(JS_DIR, 'data-catalog.js'), buildVerboseCatalogJs(), 'utf8');
    fs.writeFileSync(path.join(JS_DIR, 'legacy-unused-widget.js'), buildUnusedLegacyJs(), 'utf8');

    fs.writeFileSync(indexPath, buildOriginalHtml(), 'utf8');

    return { created: true, path: ORIGINAL_DIR };
}

if (require.main === module) {
    generateControlledTestWebsite({ force: process.argv.includes('--force') })
        .then((res) => {
            console.log('Controlled test website ready:', res);
        })
        .catch((err) => {
            console.error('Failed to generate controlled test website:', err);
            process.exit(1);
        });
}

module.exports = {
    generateControlledTestWebsite,
    ORIGINAL_DIR,
};
