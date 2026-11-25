// backend/services/validationService.js
// Module 4: Before-and-After Experimental Validation Service
// Performs genuine repeated Playwright scans of the original vs. optimized controlled website
// under identical browser/network configurations, aggregates statistics, and exports CSV/JSON.

const fs = require('fs');
const path = require('path');
const { analyzeUrlPerformanceOnly } = require('./analysisService');
const { normalizeAnalysisData } = require('./normalizationService');
const { ORIGINAL_DIR, OPTIMIZED_DIR, ensureOriginalBaselineExists } = require('./optimizationService');
const { saveAnalysisResult } = require('./dbService');

const DEFAULT_VALIDATION_BROWSER_CONFIG = {
    viewport: { width: 1280, height: 720 },
    waitUntil: 'load',
    settleMs: 800,
    disableCache: true,
    captureAssetDetails: true,
};

function mean(values) {
    if (!values.length) return 0;
    return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function stdDev(values) {
    if (values.length <= 1) return 0;
    const avg = mean(values);
    const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
}

function summarizeSeries(values, decimals = 2) {
    if (!values.length) {
        return { mean: 0, stdDev: 0, min: 0, max: 0, n: 0 };
    }
    const factor = 10 ** decimals;
    const round = (x) => Math.round(x * factor) / factor;
    return {
        mean: round(mean(values)),
        stdDev: round(stdDev(values)),
        min: round(Math.min(...values)),
        max: round(Math.max(...values)),
        n: values.length,
    };
}

/**
 * Zero-denominator-safe percentage reduction calculation:
 *   positive % = reduction (e.g., smaller bytes, fewer requests, lower CO2)
 *   negative % = increase
 *   null = baseline was 0 (division by zero avoided)
 */
function safeReductionPct(baselineVal, optimizedVal) {
    if (!Number.isFinite(baselineVal) || baselineVal === 0) {
        return null;
    }
    return Number((((baselineVal - optimizedVal) / baselineVal) * 100).toFixed(2));
}

function safeChangePct(baselineVal, optimizedVal) {
    if (!Number.isFinite(baselineVal) || baselineVal === 0) {
        return null;
    }
    return Number((((optimizedVal - baselineVal) / baselineVal) * 100).toFixed(2));
}

function aggregateScanRuns(scans) {
    return {
        runCount: scans.length,
        measuredNetwork: {
            totalBytes: summarizeSeries(scans.map((s) => s.totalBytes), 0),
            pageWeightMB: summarizeSeries(scans.map((s) => s.pageWeightMB), 4),
            imageBytes: summarizeSeries(scans.map((s) => s.imageBytes), 0),
            imageCount: summarizeSeries(scans.map((s) => s.imageCount), 2),
            scriptBytes: summarizeSeries(scans.map((s) => s.scriptBytes), 0),
            scriptCount: summarizeSeries(scans.map((s) => s.scriptCount), 2),
            styleBytes: summarizeSeries(scans.map((s) => s.styleBytes), 0),
            styleCount: summarizeSeries(scans.map((s) => s.styleCount), 2),
            fontBytes: summarizeSeries(scans.map((s) => s.fontBytes), 0),
            otherBytes: summarizeSeries(scans.map((s) => s.otherBytes), 0),
            totalRequests: summarizeSeries(scans.map((s) => s.totalRequests), 2),
            thirdPartyRequests: summarizeSeries(scans.map((s) => s.thirdPartyRequests), 2),
        },
        measuredPerformance: {
            timeToFirstByteMs: summarizeSeries(scans.map((s) => s.timeToFirstByteMs), 1),
            domContentLoadedMs: summarizeSeries(scans.map((s) => s.domContentLoadedMs), 1),
            pageLoadTimeMs: summarizeSeries(scans.map((s) => s.pageLoadTimeMs), 1),
            estimated4gLatencyMs: summarizeSeries(scans.map((s) => s.estimated4gLatencyMs), 1),
        },
        calculatedEstimates: {
            energyUsedKWh: summarizeSeries(scans.map((s) => s.energyUsedKWh), 8),
            co2EstimateGrams: summarizeSeries(scans.map((s) => s.co2EstimateGrams), 6),
            carbonScore: summarizeSeries(scans.map((s) => s.carbonScore), 2),
        },
    };
}

function buildComparisonMetrics(aggBaseline, aggOptimized) {
    const bNet = aggBaseline.measuredNetwork;
    const oNet = aggOptimized.measuredNetwork;
    const bPerf = aggBaseline.measuredPerformance;
    const oPerf = aggOptimized.measuredPerformance;
    const bCalc = aggBaseline.calculatedEstimates;
    const oCalc = aggOptimized.calculatedEstimates;

    const metricDelta = (bVal, oVal, provenance, higherIsBetter = false, decimals = 2) => {
        const factor = 10 ** decimals;
        const absDiff = Math.round((bVal - oVal) * factor) / factor;
        return {
            baselineMean: bVal,
            optimizedMean: oVal,
            absoluteDifference: higherIsBetter ? Math.round((oVal - bVal) * factor) / factor : absDiff,
            percentageReduction: higherIsBetter ? null : safeReductionPct(bVal, oVal),
            percentageChange: safeChangePct(bVal, oVal),
            provenance,
        };
    };

    return {
        provenanceLegend: {
            MEASURED_BROWSER_NETWORK: 'Directly measured by Playwright Chromium network & Navigation Timing APIs',
            CALCULATED_ENERGY_ESTIMATE: 'Calculated estimate (0.06 kWh per GB transferred)',
            CALCULATED_CARBON_ESTIMATE: 'Calculated estimate (energy * grid intensity gCO2/kWh)',
            CALCULATED_SUSTAINABILITY_SCORE: 'Calculated score (round(100 * exp(-0.15 * MB)))',
        },
        resources: {
            totalBytes: metricDelta(bNet.totalBytes.mean, oNet.totalBytes.mean, 'MEASURED_BROWSER_NETWORK', false, 0),
            pageWeightMB: metricDelta(bNet.pageWeightMB.mean, oNet.pageWeightMB.mean, 'MEASURED_BROWSER_NETWORK', false, 4),
            imageBytes: metricDelta(bNet.imageBytes.mean, oNet.imageBytes.mean, 'MEASURED_BROWSER_NETWORK', false, 0),
            scriptBytes: metricDelta(bNet.scriptBytes.mean, oNet.scriptBytes.mean, 'MEASURED_BROWSER_NETWORK', false, 0),
            styleBytes: metricDelta(bNet.styleBytes.mean, oNet.styleBytes.mean, 'MEASURED_BROWSER_NETWORK', false, 0),
            otherBytes: metricDelta(bNet.otherBytes.mean, oNet.otherBytes.mean, 'MEASURED_BROWSER_NETWORK', false, 0),
            totalRequests: metricDelta(bNet.totalRequests.mean, oNet.totalRequests.mean, 'MEASURED_BROWSER_NETWORK', false, 2),
            thirdPartyRequests: metricDelta(
                bNet.thirdPartyRequests.mean,
                oNet.thirdPartyRequests.mean,
                'MEASURED_BROWSER_NETWORK',
                false,
                2
            ),
        },
        performance: {
            timeToFirstByteMs: metricDelta(
                bPerf.timeToFirstByteMs.mean,
                oPerf.timeToFirstByteMs.mean,
                'MEASURED_BROWSER_NETWORK',
                false,
                1
            ),
            domContentLoadedMs: metricDelta(
                bPerf.domContentLoadedMs.mean,
                oPerf.domContentLoadedMs.mean,
                'MEASURED_BROWSER_NETWORK',
                false,
                1
            ),
            pageLoadTimeMs: metricDelta(
                bPerf.pageLoadTimeMs.mean,
                oPerf.pageLoadTimeMs.mean,
                'MEASURED_BROWSER_NETWORK',
                false,
                1
            ),
            estimated4gLatencyMs: metricDelta(
                bPerf.estimated4gLatencyMs.mean,
                oPerf.estimated4gLatencyMs.mean,
                'CALCULATED_ESTIMATE',
                false,
                1
            ),
        },
        sustainability: {
            energyUsedKWh: metricDelta(
                bCalc.energyUsedKWh.mean,
                oCalc.energyUsedKWh.mean,
                'CALCULATED_ENERGY_ESTIMATE',
                false,
                8
            ),
            co2EstimateGrams: metricDelta(
                bCalc.co2EstimateGrams.mean,
                oCalc.co2EstimateGrams.mean,
                'CALCULATED_CARBON_ESTIMATE',
                false,
                6
            ),
            carbonScore: metricDelta(
                bCalc.carbonScore.mean,
                oCalc.carbonScore.mean,
                'CALCULATED_SUSTAINABILITY_SCORE',
                true,
                2
            ),
        },
    };
}

async function executeSingleControlledScan(targetUrl, version, runIndex, scanOptions, userId = null, persistToAnalysisTable = false) {
    const startedAt = new Date().toISOString();
    const scrape = await analyzeUrlPerformanceOnly(targetUrl, scanOptions);
    const net = scrape.networkMetrics;
    const speed = scrape.speedMetrics;
    const norm = await normalizeAnalysisData(targetUrl, net, speed, { isGreenHost: false });

    let analysisId = null;
    if (persistToAnalysisTable && userId) {
        try {
            const receipt = await saveAnalysisResult(userId, targetUrl, {
                pageWeightMB: norm.pageWeightMB,
                carbonScore: norm.carbonScore,
                co2EstimateGrams: norm.co2EstimateGrams,
                isGreenHost: norm.isGreenHost,
                timeToFirstByteMs: norm.timeToFirstByteMs,
                domContentLoadedMs: norm.domContentLoadedMs,
                pageLoadTimeMs: norm.pageLoadTimeMs,
                estimated4gLatencyMs: norm.estimated4gLatencyMs,
                seoMetadata: null,
                rawScrapedData: net,
            });
            analysisId = receipt.insertId;
        } catch (err) {
            console.warn('[validationService] Optional analysis table link skipped:', err.message);
        }
    }

    return {
        version,
        runIndex,
        url: targetUrl,
        analysisId,
        scannedAt: startedAt,
        browserConfig: scrape.browserConfig,
        totalBytes: net.totalBytes,
        pageWeightMB: Number(norm.pageWeightMB.toFixed(4)),
        imageBytes: net.imageBytes,
        imageCount: net.imageCount,
        scriptBytes: net.scriptBytes,
        scriptCount: net.scriptCount,
        styleBytes: net.styleBytes,
        styleCount: net.styleCount,
        fontBytes: net.fontBytes,
        fontCount: net.fontCount,
        otherBytes: net.otherBytes || 0,
        totalRequests: net.totalRequests,
        thirdPartyRequests: net.thirdPartyRequests,
        timeToFirstByteMs: norm.timeToFirstByteMs,
        domContentLoadedMs: norm.domContentLoadedMs,
        pageLoadTimeMs: norm.pageLoadTimeMs,
        estimated4gLatencyMs: norm.estimated4gLatencyMs,
        energyUsedKWh: norm.energyUsedKWh,
        co2EstimateGrams: norm.co2EstimateGramsPrecise,
        carbonScore: norm.carbonScore,
        grade: norm.grade,
        isGreenHost: norm.isGreenHost,
    };
}

/**
 * Executes a controlled Before-and-After Validation Experiment with N repetitions.
 */
async function runBeforeAfterValidation({
    originalUrl,
    optimizedUrl,
    repetitions = 3,
    experimentName = 'Controlled Website Before-and-After Validation',
    optimizationRunId = null,
    userId = null,
    persistIndividualToAnalysis = false,
    browserOptions = {},
} = {}) {
    await ensureOriginalBaselineExists();

    if (!fs.existsSync(path.join(ORIGINAL_DIR, 'index.html'))) {
        throw new Error('Original controlled test website is missing.');
    }
    if (!fs.existsSync(path.join(OPTIMIZED_DIR, 'index.html'))) {
        throw new Error(
            'Optimized controlled test website has not been generated yet. Run Module 3 (Website Optimization) first.'
        );
    }

    const safeReps = Math.min(10, Math.max(1, Math.floor(Number(repetitions) || 3)));
    const scanOptions = {
        ...DEFAULT_VALIDATION_BROWSER_CONFIG,
        ...browserOptions,
    };

    const baselineScans = [];
    const optimizedScans = [];

    for (let i = 1; i <= safeReps; i++) {
        const baseScan = await executeSingleControlledScan(
            originalUrl,
            'original',
            i,
            scanOptions,
            userId,
            persistIndividualToAnalysis
        );
        baselineScans.push(baseScan);

        const optScan = await executeSingleControlledScan(
            optimizedUrl,
            'optimized',
            i,
            scanOptions,
            userId,
            persistIndividualToAnalysis
        );
        optimizedScans.push(optScan);
    }

    const aggregatedBaseline = aggregateScanRuns(baselineScans);
    const aggregatedOptimized = aggregateScanRuns(optimizedScans);
    const comparison = buildComparisonMetrics(aggregatedBaseline, aggregatedOptimized);

    const browserConfig = baselineScans[0]?.browserConfig || scanOptions;

    return {
        resultType: 'ACTUAL_MEASURED_VALIDATION',
        experimentName,
        optimizationRunId,
        originalUrl,
        optimizedUrl,
        repetitions: safeReps,
        browserConfig,
        baselineScans,
        optimizedScans,
        aggregatedBaseline,
        aggregatedOptimized,
        comparison,
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
    };
}

function csvEscape(val) {
    const str = val === null || val === undefined ? '' : String(val);
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function exportExperimentToCsv(experiment) {
    const headers = [
        'experiment_id',
        'experiment_name',
        'version',
        'run_index',
        'scanned_at',
        'url',
        'total_bytes',
        'page_weight_mb',
        'image_bytes',
        'image_count',
        'script_bytes',
        'script_count',
        'style_bytes',
        'style_count',
        'font_bytes',
        'other_bytes',
        'total_requests',
        'third_party_requests',
        'ttfb_ms',
        'dom_content_loaded_ms',
        'page_load_time_ms',
        'estimated_4g_latency_ms',
        'energy_kwh_estimate',
        'co2_grams_estimate',
        'carbon_score',
        'is_green_host',
    ];

    const allScans = [...(experiment.baselineScans || []), ...(experiment.optimizedScans || [])];
    const rows = allScans.map((s) =>
        [
            experiment.id ?? 'unsaved',
            experiment.experimentName,
            s.version,
            s.runIndex,
            s.scannedAt,
            s.url,
            s.totalBytes,
            s.pageWeightMB,
            s.imageBytes,
            s.imageCount,
            s.scriptBytes,
            s.scriptCount,
            s.styleBytes,
            s.styleCount,
            s.fontBytes,
            s.otherBytes,
            s.totalRequests,
            s.thirdPartyRequests,
            s.timeToFirstByteMs,
            s.domContentLoadedMs,
            s.pageLoadTimeMs,
            s.estimated4gLatencyMs,
            s.energyUsedKWh,
            s.co2EstimateGrams,
            s.carbonScore,
            s.isGreenHost ? 1 : 0,
        ]
            .map(csvEscape)
            .join(',')
    );

    return [headers.join(','), ...rows].join('\n');
}

module.exports = {
    DEFAULT_VALIDATION_BROWSER_CONFIG,
    runBeforeAfterValidation,
    aggregateScanRuns,
    buildComparisonMetrics,
    safeReductionPct,
    safeChangePct,
    exportExperimentToCsv,
};
