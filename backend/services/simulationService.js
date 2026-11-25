// backend/services/simulationService.js
// Module 2: What-if Optimization Simulator Engine
// Produces strictly validated, reconciled SIMULATED / HYPOTHETICAL RESULTS using real scan baselines.
const { calculateSustainabilityMetrics } = require('./normalizationService');

/**
 * Documented catalog of configurable What-if scenarios and safe assumption bounds.
 * Multiple techniques inside a single category combine multiplicatively:
 *   effectiveReduction = min(categoryCap, 1 - Product(1 - r_i))
 * so overlapping optimizations never double-count or exceed 100%.
 */
const SCENARIO_CATALOG = {
    imageOptimization: {
        id: 'imageOptimization',
        label: 'Scenario A — Image Optimization',
        targetCategory: 'images',
        maxCombinedReductionPct: 90,
        techniques: {
            compressionPct: {
                label: 'Lossy/Lossless Image Compression',
                defaultPct: 25,
                minPct: 0,
                maxPct: 60,
                description: 'Applies quality-controlled compression to raster images.',
            },
            webpConversionPct: {
                label: 'Conversion to WebP / Modern Format',
                defaultPct: 30,
                minPct: 0,
                maxPct: 65,
                description: 'Re-encodes JPEG/PNG payloads into WebP.',
            },
            responsiveDeliveryPct: {
                label: 'Responsive Image Delivery (srcset/sizing)',
                defaultPct: 20,
                minPct: 0,
                maxPct: 60,
                description: 'Serves appropriately dimensioned images per viewport.',
            },
            removeUnusedImagesPct: {
                label: 'Remove Unnecessary Image Resources',
                defaultPct: 0,
                minPct: 0,
                maxPct: 50,
                description: 'Eliminates decorative or hidden image downloads.',
            },
        },
    },
    javascriptOptimization: {
        id: 'javascriptOptimization',
        label: 'Scenario B — JavaScript Optimization',
        targetCategory: 'scripts',
        maxCombinedReductionPct: 85,
        techniques: {
            minificationPct: {
                label: 'JavaScript Minification',
                defaultPct: 20,
                minPct: 0,
                maxPct: 50,
                description: 'Strips whitespace, comments, and shortens local identifiers.',
            },
            unusedJsReductionPct: {
                label: 'Unused JavaScript Reduction (Tree-Shaking)',
                defaultPct: 25,
                minPct: 0,
                maxPct: 65,
                description: 'Removes dead code and unused library exports.',
            },
            codeSplittingPct: {
                label: 'Code Splitting (Defer Non-Critical Chunks)',
                defaultPct: 15,
                minPct: 0,
                maxPct: 55,
                description: 'Defers route/feature bundles not required for initial load.',
            },
            removeUnnecessaryScriptsPct: {
                label: 'Remove Unnecessary Scripts',
                defaultPct: 0,
                minPct: 0,
                maxPct: 60,
                description: 'Eliminates redundant or legacy script files.',
            },
        },
    },
    cssOptimization: {
        id: 'cssOptimization',
        label: 'Scenario C — CSS Optimization',
        targetCategory: 'styles',
        maxCombinedReductionPct: 85,
        techniques: {
            minificationPct: {
                label: 'CSS Minification',
                defaultPct: 20,
                minPct: 0,
                maxPct: 50,
                description: 'Compresses whitespace, comments, and shorthand properties.',
            },
            unusedCssReductionPct: {
                label: 'Unused CSS Reduction (Purging)',
                defaultPct: 30,
                minPct: 0,
                maxPct: 75,
                description: 'Eliminates selectors not matched on the rendered page.',
            },
            stylesheetConsolidationPct: {
                label: 'Stylesheet Optimization & Consolidation',
                defaultPct: 10,
                minPct: 0,
                maxPct: 40,
                description: 'Merges duplicate declarations and removes redundant stylesheets.',
            },
        },
    },
    resourceRequestOptimization: {
        id: 'resourceRequestOptimization',
        label: 'Scenario D — Resource & Request Optimization',
        targetCategory: 'requests',
        maxCombinedReductionPct: 80,
        techniques: {
            httpRequestReductionPct: {
                label: 'Reduction of Unnecessary HTTP Requests',
                defaultPct: 20,
                minPct: 0,
                maxPct: 70,
                description: 'Eliminates redundant requests and improves bundling/caching.',
            },
            thirdPartyReductionPct: {
                label: 'Reduction of Third-Party Resources',
                defaultPct: 30,
                minPct: 0,
                maxPct: 80,
                description: 'Removes non-essential third-party trackers, widgets, and embeds.',
            },
            resourceLoadingOptimizationPct: {
                label: 'Resource-Loading & Other Payload Optimization',
                defaultPct: 15,
                minPct: 0,
                maxPct: 50,
                description: 'Applies compression/lazy loading to remaining non-core payloads (HTML/JSON/other).',
            },
        },
    },
};

function toSafeNonNeg(value, fieldName) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
        throw new Error(`Invalid baseline value for ${fieldName}: must be a non-negative finite number.`);
    }
    return num;
}

function validatePercentage(value, fieldPath, min = 0, max = 100) {
    if (value === undefined || value === null || value === '') return 0;
    const num = Number(value);
    if (!Number.isFinite(num)) {
        throw new Error(`Invalid percentage for ${fieldPath}: must be a finite number.`);
    }
    if (num < 0 || num > 100) {
        throw new Error(`Out-of-range percentage for ${fieldPath}: ${num}% (must be between 0% and 100%).`);
    }
    if (num < min || num > max) {
        throw new Error(
            `Out-of-bounds assumption for ${fieldPath}: ${num}% (allowed range: ${min}%–${max}%).`
        );
    }
    return num;
}

/**
 * Multiplicative compounding prevents double-counting overlapping reductions in the same category.
 * Example: 30% compression + 30% WebP => 1 - (0.7 * 0.7) = 51% effective reduction (NOT 60%).
 */
function computeCompoundedReductionPct(percentages, maxCapPct) {
    let remainingFactor = 1;
    const seenKeys = new Set();

    for (const [key, pctVal] of Object.entries(percentages)) {
        if (seenKeys.has(key)) {
            throw new Error(`Duplicate reduction technique detected: ${key}`);
        }
        seenKeys.add(key);
        const r = pctVal / 100;
        remainingFactor *= 1 - r;
    }

    const rawEffectivePct = (1 - remainingFactor) * 100;
    const cappedEffectivePct = Math.min(rawEffectivePct, maxCapPct, 100);
    return {
        rawEffectivePct: Number(rawEffectivePct.toFixed(2)),
        effectiveReductionPct: Number(cappedEffectivePct.toFixed(2)),
        capApplied: rawEffectivePct > maxCapPct,
    };
}

function safePctImprovement(baselineVal, simulatedVal) {
    if (!Number.isFinite(baselineVal) || baselineVal <= 0) {
        return 0;
    }
    return Number((((baselineVal - simulatedVal) / baselineVal) * 100).toFixed(2));
}

/**
 * Extracts and reconciles baseline measurements from a real scan record.
 */
function extractBaselineFromAnalysisRow(row) {
    if (!row || typeof row !== 'object') {
        throw new Error('MISSING_SCAN_TELEMETRY: Baseline scan record is required.');
    }

    const payloadRaw = row.analysis_payload?.AI_METRICS_INPUT?.rawScrapedData || {};
    const hasExplicitTelemetry = [
        row.totalBytes,
        payloadRaw.totalBytes,
        row.page_size,
        row.pageWeightMB,
        row.image_bytes,
        row.imageBytes,
        row.script_bytes,
        row.scriptBytes,
        row.style_bytes,
        row.styleBytes,
        row.total_requests,
        row.totalRequests,
    ].some((v) => v !== undefined && v !== null);

    if (!hasExplicitTelemetry) {
        throw new Error('MISSING_SCAN_TELEMETRY: Baseline scan contains no measurable telemetry.');
    }

    const imageBytes = toSafeNonNeg(row.image_bytes ?? row.imageBytes ?? 0, 'imageBytes');
    const scriptBytes = toSafeNonNeg(row.script_bytes ?? row.scriptBytes ?? 0, 'scriptBytes');
    const styleBytes = toSafeNonNeg(row.style_bytes ?? row.styleBytes ?? 0, 'styleBytes');
    const fontBytes = toSafeNonNeg(row.font_bytes ?? row.fontBytes ?? 0, 'fontBytes');
    const categorizedSum = imageBytes + scriptBytes + styleBytes + fontBytes;

    let totalBytes = 0;
    if (row.totalBytes !== undefined && row.totalBytes !== null) {
        totalBytes = toSafeNonNeg(row.totalBytes, 'totalBytes');
    } else if (payloadRaw.totalBytes !== undefined && payloadRaw.totalBytes !== null && Number(payloadRaw.totalBytes) > 0) {
        totalBytes = toSafeNonNeg(payloadRaw.totalBytes, 'payloadRaw.totalBytes');
    } else if (row.page_size !== undefined && row.page_size !== null) {
        totalBytes = Math.round(toSafeNonNeg(row.page_size, 'page_size') * 1024 * 1024);
    } else if (row.pageWeightMB !== undefined && row.pageWeightMB !== null) {
        totalBytes = Math.round(toSafeNonNeg(row.pageWeightMB, 'pageWeightMB') * 1024 * 1024);
    }

    // Ensure totalBytes strictly reconciles with categorized bytes (never less than sum of known categories)
    if (totalBytes < categorizedSum) {
        totalBytes = categorizedSum;
    }
    // Avoid spurious FLOAT rounding drift from MySQL `page_size` when exact totalBytes wasn't persisted separately
    if (categorizedSum > 0 && Math.abs(totalBytes - categorizedSum) <= 16 && row.totalBytes == null) {
        totalBytes = categorizedSum;
    }
    const otherBytes = Math.max(0, totalBytes - categorizedSum);

    const totalRequests = Math.floor(toSafeNonNeg(row.total_requests ?? row.totalRequests ?? 0, 'totalRequests'));
    const thirdPartyRequests = Math.min(
        totalRequests,
        Math.floor(toSafeNonNeg(row.third_party_requests ?? row.thirdPartyRequests ?? 0, 'thirdPartyRequests'))
    );
    const isGreenHost = Boolean(row.is_green_host ?? row.isGreenHost ?? false);

    const calc = calculateSustainabilityMetrics({ totalBytes, isGreenHost });

    return {
        analysisId: row.id ?? row.analysisId ?? null,
        targetUrl: row.url ?? row.targetUrl ?? 'unknown',
        totalBytes,
        pageWeightMB: Number(calc.pageWeightMB.toFixed(4)),
        imageBytes,
        imageCount: Math.floor(toSafeNonNeg(row.image_count ?? row.imageCount ?? 0, 'imageCount')),
        scriptBytes,
        scriptCount: Math.floor(toSafeNonNeg(row.script_count ?? row.scriptCount ?? 0, 'scriptCount')),
        styleBytes,
        styleCount: Math.floor(toSafeNonNeg(row.style_count ?? row.styleCount ?? 0, 'styleCount')),
        fontBytes,
        fontCount: Math.floor(toSafeNonNeg(row.font_count ?? row.fontCount ?? 0, 'fontCount')),
        otherBytes,
        totalRequests,
        thirdPartyRequests,
        isGreenHost,
        energyUsedKWh: calc.energyUsedKWh,
        co2EstimateGrams: calc.co2EstimateGrams,
        co2EstimateGramsPrecise: calc.co2EstimateGramsPrecise,
        carbonScore: calc.carbonScore,
        grade: calc.grade,
        carbonIntensity: calc.carbonIntensity,
    };
}

/**
 * Validates scenario config & assumptions and computes hypothetical optimization outcomes.
 */
function runWhatIfSimulation(baselineInput, scenarioInput = {}, options = {}) {
    const baseline = extractBaselineFromAnalysisRow(baselineInput);

    if (!scenarioInput || typeof scenarioInput !== 'object') {
        throw new Error('scenarioConfig must be an object.');
    }

    const enabledScenarios = {
        imageOptimization: Boolean(scenarioInput.imageOptimization?.enabled),
        javascriptOptimization: Boolean(scenarioInput.javascriptOptimization?.enabled),
        cssOptimization: Boolean(scenarioInput.cssOptimization?.enabled),
        resourceRequestOptimization: Boolean(scenarioInput.resourceRequestOptimization?.enabled),
    };

    // Optional green hosting simulation flag (defaults to baseline hosting)
    const simGreenHost =
        options.simulateGreenHosting !== undefined ? Boolean(options.simulateGreenHosting) : baseline.isGreenHost;
    const greenHostingChanged = simGreenHost !== baseline.isGreenHost;

    const anyEnabled = Object.values(enabledScenarios).some(Boolean);
    if (!anyEnabled && !greenHostingChanged) {
        throw new Error('Enable at least one optimization scenario or toggle green hosting simulation.');
    }

    // Validate assumptions per enabled scenario
    const validatedAssumptions = {};
    const scenarioBreakdown = {};

    // --- Scenario A: Images ---
    let imgEffective = { rawEffectivePct: 0, effectiveReductionPct: 0, capApplied: false };
    if (enabledScenarios.imageOptimization) {
        const cfg = scenarioInput.imageOptimization || {};
        const defs = SCENARIO_CATALOG.imageOptimization.techniques;
        const vals = {
            compressionPct: validatePercentage(cfg.compressionPct ?? defs.compressionPct.defaultPct, 'imageOptimization.compressionPct', defs.compressionPct.minPct, defs.compressionPct.maxPct),
            webpConversionPct: validatePercentage(cfg.webpConversionPct ?? defs.webpConversionPct.defaultPct, 'imageOptimization.webpConversionPct', defs.webpConversionPct.minPct, defs.webpConversionPct.maxPct),
            responsiveDeliveryPct: validatePercentage(cfg.responsiveDeliveryPct ?? defs.responsiveDeliveryPct.defaultPct, 'imageOptimization.responsiveDeliveryPct', defs.responsiveDeliveryPct.minPct, defs.responsiveDeliveryPct.maxPct),
            removeUnusedImagesPct: validatePercentage(cfg.removeUnusedImagesPct ?? defs.removeUnusedImagesPct.defaultPct, 'imageOptimization.removeUnusedImagesPct', defs.removeUnusedImagesPct.minPct, defs.removeUnusedImagesPct.maxPct),
        };
        imgEffective = computeCompoundedReductionPct(vals, SCENARIO_CATALOG.imageOptimization.maxCombinedReductionPct);
        validatedAssumptions.imageOptimization = { ...vals, ...imgEffective };
    }

    // --- Scenario B: JavaScript ---
    let jsEffective = { rawEffectivePct: 0, effectiveReductionPct: 0, capApplied: false };
    if (enabledScenarios.javascriptOptimization) {
        const cfg = scenarioInput.javascriptOptimization || {};
        const defs = SCENARIO_CATALOG.javascriptOptimization.techniques;
        const vals = {
            minificationPct: validatePercentage(cfg.minificationPct ?? defs.minificationPct.defaultPct, 'javascriptOptimization.minificationPct', defs.minificationPct.minPct, defs.minificationPct.maxPct),
            unusedJsReductionPct: validatePercentage(cfg.unusedJsReductionPct ?? defs.unusedJsReductionPct.defaultPct, 'javascriptOptimization.unusedJsReductionPct', defs.unusedJsReductionPct.minPct, defs.unusedJsReductionPct.maxPct),
            codeSplittingPct: validatePercentage(cfg.codeSplittingPct ?? defs.codeSplittingPct.defaultPct, 'javascriptOptimization.codeSplittingPct', defs.codeSplittingPct.minPct, defs.codeSplittingPct.maxPct),
            removeUnnecessaryScriptsPct: validatePercentage(cfg.removeUnnecessaryScriptsPct ?? defs.removeUnnecessaryScriptsPct.defaultPct, 'javascriptOptimization.removeUnnecessaryScriptsPct', defs.removeUnnecessaryScriptsPct.minPct, defs.removeUnnecessaryScriptsPct.maxPct),
        };
        jsEffective = computeCompoundedReductionPct(vals, SCENARIO_CATALOG.javascriptOptimization.maxCombinedReductionPct);
        validatedAssumptions.javascriptOptimization = { ...vals, ...jsEffective };
    }

    // --- Scenario C: CSS ---
    let cssEffective = { rawEffectivePct: 0, effectiveReductionPct: 0, capApplied: false };
    if (enabledScenarios.cssOptimization) {
        const cfg = scenarioInput.cssOptimization || {};
        const defs = SCENARIO_CATALOG.cssOptimization.techniques;
        const vals = {
            minificationPct: validatePercentage(cfg.minificationPct ?? defs.minificationPct.defaultPct, 'cssOptimization.minificationPct', defs.minificationPct.minPct, defs.minificationPct.maxPct),
            unusedCssReductionPct: validatePercentage(cfg.unusedCssReductionPct ?? defs.unusedCssReductionPct.defaultPct, 'cssOptimization.unusedCssReductionPct', defs.unusedCssReductionPct.minPct, defs.unusedCssReductionPct.maxPct),
            stylesheetConsolidationPct: validatePercentage(cfg.stylesheetConsolidationPct ?? defs.stylesheetConsolidationPct.defaultPct, 'cssOptimization.stylesheetConsolidationPct', defs.stylesheetConsolidationPct.minPct, defs.stylesheetConsolidationPct.maxPct),
        };
        cssEffective = computeCompoundedReductionPct(vals, SCENARIO_CATALOG.cssOptimization.maxCombinedReductionPct);
        validatedAssumptions.cssOptimization = { ...vals, ...cssEffective };
    }

    // --- Scenario D: Resources & Requests ---
    // To strictly prevent double-counting with Scenarios A/B/C:
    //   - `thirdPartyReductionPct` reduces thirdPartyRequests count
    //   - `httpRequestReductionPct` reduces remaining non-third-party requests (compounded cleanly)
    //   - `resourceLoadingOptimizationPct` applies ONLY to `otherBytes` (HTML/JSON/misc payloads NOT already reduced by A/B/C)
    let reqVals = null;
    if (enabledScenarios.resourceRequestOptimization) {
        const cfg = scenarioInput.resourceRequestOptimization || {};
        const defs = SCENARIO_CATALOG.resourceRequestOptimization.techniques;
        reqVals = {
            httpRequestReductionPct: validatePercentage(cfg.httpRequestReductionPct ?? defs.httpRequestReductionPct.defaultPct, 'resourceRequestOptimization.httpRequestReductionPct', defs.httpRequestReductionPct.minPct, defs.httpRequestReductionPct.maxPct),
            thirdPartyReductionPct: validatePercentage(cfg.thirdPartyReductionPct ?? defs.thirdPartyReductionPct.defaultPct, 'resourceRequestOptimization.thirdPartyReductionPct', defs.thirdPartyReductionPct.minPct, defs.thirdPartyReductionPct.maxPct),
            resourceLoadingOptimizationPct: validatePercentage(cfg.resourceLoadingOptimizationPct ?? defs.resourceLoadingOptimizationPct.defaultPct, 'resourceRequestOptimization.resourceLoadingOptimizationPct', defs.resourceLoadingOptimizationPct.minPct, defs.resourceLoadingOptimizationPct.maxPct),
        };
        validatedAssumptions.resourceRequestOptimization = { ...reqVals };
    }

    // Calculate simulated category bytes (strictly non-negative, integer bytes)
    const imageBytesSaved = Math.min(
        baseline.imageBytes,
        Math.round(baseline.imageBytes * (imgEffective.effectiveReductionPct / 100))
    );
    const scriptBytesSaved = Math.min(
        baseline.scriptBytes,
        Math.round(baseline.scriptBytes * (jsEffective.effectiveReductionPct / 100))
    );
    const styleBytesSaved = Math.min(
        baseline.styleBytes,
        Math.round(baseline.styleBytes * (cssEffective.effectiveReductionPct / 100))
    );
    const otherBytesSaved = reqVals
        ? Math.min(
            baseline.otherBytes,
            Math.round(baseline.otherBytes * (reqVals.resourceLoadingOptimizationPct / 100))
        )
        : 0;

    const simImageBytes = Math.max(0, baseline.imageBytes - imageBytesSaved);
    const simScriptBytes = Math.max(0, baseline.scriptBytes - scriptBytesSaved);
    const simStyleBytes = Math.max(0, baseline.styleBytes - styleBytesSaved);
    const simFontBytes = baseline.fontBytes; // preserved unchanged unless future scenario added
    const simOtherBytes = Math.max(0, baseline.otherBytes - otherBytesSaved);

    // Exact reconciliation: simulated total bytes = exact sum of simulated categories
    const simTotalBytes = simImageBytes + simScriptBytes + simStyleBytes + simFontBytes + simOtherBytes;
    const totalBytesSaved = baseline.totalBytes - simTotalBytes;

    // Reconciliation assertion
    if (simTotalBytes < 0 || totalBytesSaved < 0 || simTotalBytes > baseline.totalBytes) {
        throw new Error('Simulation reconciliation invariant failed.');
    }

    // Calculate simulated requests without double-counting third-party & first-party request reductions
    let simThirdPartyRequests = baseline.thirdPartyRequests;
    let simTotalRequests = baseline.totalRequests;
    if (reqVals) {
        const thirdPartyRemoved = Math.min(
            baseline.thirdPartyRequests,
            Math.round(baseline.thirdPartyRequests * (reqVals.thirdPartyReductionPct / 100))
        );
        simThirdPartyRequests = Math.max(0, baseline.thirdPartyRequests - thirdPartyRemoved);

        const firstPartyRequests = Math.max(0, baseline.totalRequests - baseline.thirdPartyRequests);
        const firstPartyRemoved = Math.min(
            firstPartyRequests,
            Math.round(firstPartyRequests * (reqVals.httpRequestReductionPct / 100))
        );
        // Ensure at least 1 document request remains if baseline had >= 1 request
        const minRequests = baseline.totalRequests > 0 ? 1 : 0;
        simTotalRequests = Math.max(minRequests, simThirdPartyRequests + (firstPartyRequests - firstPartyRemoved));
    }

    const simCalc = calculateSustainabilityMetrics({
        totalBytes: simTotalBytes,
        isGreenHost: simGreenHost,
    });

    const simulated = {
        totalBytes: simTotalBytes,
        pageWeightMB: Number(simCalc.pageWeightMB.toFixed(4)),
        imageBytes: simImageBytes,
        scriptBytes: simScriptBytes,
        styleBytes: simStyleBytes,
        fontBytes: simFontBytes,
        otherBytes: simOtherBytes,
        totalRequests: simTotalRequests,
        thirdPartyRequests: simThirdPartyRequests,
        isGreenHost: simCalc.isGreenHost,
        energyUsedKWh: simCalc.energyUsedKWh,
        co2EstimateGrams: simCalc.co2EstimateGrams,
        co2EstimateGramsPrecise: simCalc.co2EstimateGramsPrecise,
        carbonScore: simCalc.carbonScore,
        grade: simCalc.grade,
        carbonIntensity: simCalc.carbonIntensity,
    };

    // Individual scenario contribution summary (for scenario comparison charts)
    scenarioBreakdown.imageOptimization = {
        enabled: enabledScenarios.imageOptimization,
        bytesSaved: imageBytesSaved,
        effectiveCategoryReductionPct: imgEffective.effectiveReductionPct,
        shareOfTotalSavingsPct: totalBytesSaved > 0 ? Number(((imageBytesSaved / totalBytesSaved) * 100).toFixed(2)) : 0,
    };
    scenarioBreakdown.javascriptOptimization = {
        enabled: enabledScenarios.javascriptOptimization,
        bytesSaved: scriptBytesSaved,
        effectiveCategoryReductionPct: jsEffective.effectiveReductionPct,
        shareOfTotalSavingsPct: totalBytesSaved > 0 ? Number(((scriptBytesSaved / totalBytesSaved) * 100).toFixed(2)) : 0,
    };
    scenarioBreakdown.cssOptimization = {
        enabled: enabledScenarios.cssOptimization,
        bytesSaved: styleBytesSaved,
        effectiveCategoryReductionPct: cssEffective.effectiveReductionPct,
        shareOfTotalSavingsPct: totalBytesSaved > 0 ? Number(((styleBytesSaved / totalBytesSaved) * 100).toFixed(2)) : 0,
    };
    scenarioBreakdown.resourceRequestOptimization = {
        enabled: enabledScenarios.resourceRequestOptimization,
        bytesSaved: otherBytesSaved,
        requestsSaved: baseline.totalRequests - simTotalRequests,
        thirdPartyRequestsSaved: baseline.thirdPartyRequests - simThirdPartyRequests,
        shareOfTotalSavingsPct: totalBytesSaved > 0 ? Number(((otherBytesSaved / totalBytesSaved) * 100).toFixed(2)) : 0,
    };

    const comparison = {
        bytesSaved: totalBytesSaved,
        pageWeightSavedMB: Number((totalBytesSaved / (1024 * 1024)).toFixed(4)),
        pageWeightReductionPct: safePctImprovement(baseline.totalBytes, simulated.totalBytes),
        imageBytesSaved,
        imageReductionPct: safePctImprovement(baseline.imageBytes, simulated.imageBytes),
        scriptBytesSaved,
        scriptReductionPct: safePctImprovement(baseline.scriptBytes, simulated.scriptBytes),
        styleBytesSaved,
        styleReductionPct: safePctImprovement(baseline.styleBytes, simulated.styleBytes),
        otherBytesSaved,
        otherReductionPct: safePctImprovement(baseline.otherBytes, simulated.otherBytes),
        requestsSaved: baseline.totalRequests - simulated.totalRequests,
        requestsReductionPct: safePctImprovement(baseline.totalRequests, simulated.totalRequests),
        thirdPartyRequestsSaved: baseline.thirdPartyRequests - simulated.thirdPartyRequests,
        thirdPartyReductionPct: safePctImprovement(baseline.thirdPartyRequests, simulated.thirdPartyRequests),
        energySavedKWh: Number((baseline.energyUsedKWh - simulated.energyUsedKWh).toFixed(8)),
        energyReductionPct: safePctImprovement(baseline.energyUsedKWh, simulated.energyUsedKWh),
        co2SavedGrams: Number((baseline.co2EstimateGramsPrecise - simulated.co2EstimateGramsPrecise).toFixed(6)),
        co2ReductionPct: safePctImprovement(baseline.co2EstimateGramsPrecise, simulated.co2EstimateGramsPrecise),
        scoreDelta: simulated.carbonScore - baseline.carbonScore,
        reconciliationVerified:
            simTotalBytes === simImageBytes + simScriptBytes + simStyleBytes + simFontBytes + simOtherBytes &&
            totalBytesSaved === imageBytesSaved + scriptBytesSaved + styleBytesSaved + otherBytesSaved,
        scenarioBreakdown,
    };

    return {
        resultType: 'SIMULATED / HYPOTHETICAL RESULTS',
        provenance: {
            baselineBytesAndRequests: 'MEASURED',
            baselineEnergyCo2Score: 'CALCULATED',
            simulatedMetricsAndDeltas: 'SIMULATED',
        },
        disclaimer:
            'SIMULATED / HYPOTHETICAL RESULTS: Projected outcomes are computed from real baseline scan measurements using configurable optimization assumptions and the documented CarbonLens estimation methodology. No live website was modified.',
        baselineAnalysisId: baseline.analysisId,
        targetUrl: baseline.targetUrl,
        simulationName: options.simulationName || 'Custom What-if Optimization Simulation',
        scenarioConfig: enabledScenarios,
        assumptions: validatedAssumptions,
        baseline,
        simulated,
        comparison,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Generates an automatic comparison across each individual scenario (A, B, C, D) plus Combined,
 * useful for side-by-side scenario comparison charts.
 */
function runScenarioComparisonSuite(baselineInput, scenarioInput = {}, options = {}) {
    const scenarios = ['imageOptimization', 'javascriptOptimization', 'cssOptimization', 'resourceRequestOptimization'];
    const individual = {};

    for (const key of scenarios) {
        const singleConfig = {
            [key]: {
                ...(scenarioInput[key] || {}),
                enabled: true,
            },
        };
        individual[key] = runWhatIfSimulation(baselineInput, singleConfig, {
            simulationName: SCENARIO_CATALOG[key].label,
            simulateGreenHosting: options.simulateGreenHosting,
        });
    }

    const combinedConfig = {};
    for (const key of scenarios) {
        combinedConfig[key] = {
            ...(scenarioInput[key] || {}),
            enabled: true,
        };
    }
    const combined = runWhatIfSimulation(baselineInput, combinedConfig, {
        simulationName: 'Combined (All Scenarios A+B+C+D)',
        simulateGreenHosting: options.simulateGreenHosting,
    });

    return {
        resultType: 'SIMULATED / HYPOTHETICAL RESULTS',
        individual,
        combined,
    };
}

module.exports = {
    SCENARIO_CATALOG,
    extractBaselineFromAnalysisRow,
    runWhatIfSimulation,
    runScenarioComparisonSuite,
    computeCompoundedReductionPct,
};
