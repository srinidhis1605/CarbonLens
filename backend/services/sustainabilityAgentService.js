// backend/services/sustainabilityAgentService.js
// Module 1: AI Sustainability Agent (Enhanced Gemini 2.5 Flash + Evidence Extraction + Strict Validation + Deterministic Fallback)
const { OpenAI } = require('openai');
const { calculateSustainabilityMetrics } = require('./normalizationService');

const VALID_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];
const VALID_DIFFICULTIES = ['LOW', 'MEDIUM', 'HIGH'];
const VALID_CATEGORIES = [
    'Images',
    'JavaScript',
    'CSS',
    'Fonts',
    'Network & Requests',
    'Third-Party Resources',
    'Hosting',
    'Performance & Caching',
    'Page Weight',
];

const DEFAULT_AI_MODEL = process.env.AI_MODEL || 'gemini-2.5-flash';
const DEFAULT_AI_BASE_URL =
    process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
const DEFAULT_AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 35000;

function toNonNegNum(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

function bytesToKB(bytes) {
    return Number((toNonNegNum(bytes) / 1024).toFixed(1));
}

function bytesToMB(bytes) {
    return Number((toNonNegNum(bytes) / (1024 * 1024)).toFixed(3));
}

function pct(part, total) {
    if (!total || total <= 0) return 0;
    return Number(((part / total) * 100).toFixed(1));
}

/**
 * Extracts a normalized, complete scan profile from either:
 *  - a raw database row from `analysis` (+ joined `url`), OR
 *  - an existing API payload, OR
 *  - a direct structured scan input object.
 */
function buildStructuredScanInput(input = {}) {
    if (!input || typeof input !== 'object') {
        throw new Error('MISSING_SCAN_TELEMETRY: Scan input must be an object.');
    }
    const raw = input.rawScrapedData || input.networkMetrics || {};
    const payload = input.analysis_payload || input.analysis || {};
    const payloadRaw = payload?.AI_METRICS_INPUT?.rawScrapedData || {};

    const hasExplicitTelemetry = [
        input.totalBytes,
        input.pageWeightMB,
        input.page_size,
        input.imageBytes,
        input.image_bytes,
        input.scriptBytes,
        input.script_bytes,
        input.styleBytes,
        input.style_bytes,
        input.totalRequests,
        input.total_requests,
        raw.totalBytes,
        raw.imageBytes,
        raw.totalRequests,
        payloadRaw.totalBytes,
        payloadRaw.imageBytes,
        payload?.PHASE_2_ENVIRONMENTAL_RECONSTRUCTION?.TOTAL_TRANSMITTED_WEIGHT,
    ].some((v) => v !== undefined && v !== null);

    if (!hasExplicitTelemetry) {
        throw new Error('MISSING_SCAN_TELEMETRY: No scan measurements found in input.');
    }

    const phase1 = payload.PHASE_1_RAW_SOCKET_INTERCEPTION || {};
    const phase2 = payload.PHASE_2_ENVIRONMENTAL_RECONSTRUCTION || {};
    const phase3 = payload.PHASE_3_SPEED_METRICS_TRANSCRIPT?.METRICS || {};

    const parseMs = (val) => {
        if (typeof val === 'number') return toNonNegNum(val);
        const match = String(val || '').match(/([\d.]+)/);
        return match ? toNonNegNum(match[1]) : 0;
    };

    const imageBytes = toNonNegNum(input.imageBytes ?? input.image_bytes ?? raw.imageBytes);
    const scriptBytes = toNonNegNum(input.scriptBytes ?? input.script_bytes ?? raw.scriptBytes);
    const styleBytes = toNonNegNum(input.styleBytes ?? input.style_bytes ?? raw.styleBytes);
    const fontBytes = toNonNegNum(input.fontBytes ?? input.font_bytes ?? raw.fontBytes);
    const knownBytes = imageBytes + scriptBytes + styleBytes + fontBytes;

    let totalBytes = toNonNegNum(input.totalBytes ?? raw.totalBytes ?? payloadRaw.totalBytes);
    if (!totalBytes) {
        const mbFromInput = toNonNegNum(input.pageWeightMB ?? input.page_size);
        totalBytes = mbFromInput > 0 ? Math.round(mbFromInput * 1024 * 1024) : knownBytes;
    }
    if (totalBytes < knownBytes) {
        totalBytes = knownBytes;
    }
    // Avoid spurious 1-5 byte drift caused by MySQL FLOAT storage of page_size when exact totalBytes wasn't stored separately
    if (knownBytes > 0 && Math.abs(totalBytes - knownBytes) <= 16 && input.totalBytes == null && raw.totalBytes == null) {
        totalBytes = knownBytes;
    }
    const otherBytes = Math.max(0, totalBytes - knownBytes);

    const isGreenHost = Boolean(
        input.isGreenHost ??
        input.is_green_host ??
        phase2?.HOSTING_INFRASTRUCTURE?.IS_GREEN_PROVIDER ??
        false
    );

    const calc = calculateSustainabilityMetrics({ totalBytes, isGreenHost });

    const totalRequests = Math.floor(
        toNonNegNum(
            input.totalRequests ??
            input.total_requests ??
            raw.totalRequests ??
            phase1?.INTERCEPTED_TRAFFIC?.TOTAL_NETWORK_REQUESTS_LOGGED
        )
    );
    const thirdPartyRequests = Math.min(
        totalRequests,
        Math.floor(
            toNonNegNum(
                input.thirdPartyRequests ??
                input.third_party_requests ??
                raw.thirdPartyRequests ??
                phase1?.INTERCEPTED_TRAFFIC?.FOREIGN_THIRD_PARTY_INJECTIONS
            )
        )
    );

    const imageCount = Math.floor(toNonNegNum(input.imageCount ?? input.image_count ?? raw.imageCount));
    const scriptCount = Math.floor(toNonNegNum(input.scriptCount ?? input.script_count ?? raw.scriptCount));
    const styleCount = Math.floor(toNonNegNum(input.styleCount ?? input.style_count ?? raw.styleCount));
    const fontCount = Math.floor(toNonNegNum(input.fontCount ?? input.font_count ?? raw.fontCount));

    const timeToFirstByteMs = Math.round(
        toNonNegNum(input.timeToFirstByteMs ?? parseMs(phase3.SERVER_RESPONSE_LAG_TTFB))
    );
    const domContentLoadedMs = Math.round(
        toNonNegNum(input.domContentLoadedMs ?? parseMs(phase3.DOM_STRUCTURAL_READINESS))
    );
    const pageLoadTimeMs = Math.round(
        toNonNegNum(input.pageLoadTimeMs ?? parseMs(phase3.TOTAL_VISUAL_RENDER_TIME))
    );
    const estimated4gLatencyMs = Math.round(
        toNonNegNum(input.estimated4gLatencyMs ?? parseMs(phase3.ESTIMATED_4G_DOWNLOAD_DELAY))
    );

    const existingFindings = Array.isArray(input.existingFindings)
        ? input.existingFindings
        : Array.isArray(payload.AI_SUSTAINABILITY_OPTIMIZATIONS)
            ? payload.AI_SUSTAINABILITY_OPTIMIZATIONS.map((x) => x.title).filter(Boolean)
            : [];

    return {
        analysisId: input.analysisId ?? input.id ?? null,
        targetUrl: input.targetUrl || input.url || payload.TARGET_HOST || 'unknown',
        totalBytes,
        pageWeightMB: Number(calc.pageWeightMB.toFixed(4)),
        imageBytes,
        imageCount,
        imageSharePct: pct(imageBytes, totalBytes),
        scriptBytes,
        scriptCount,
        scriptSharePct: pct(scriptBytes, totalBytes),
        styleBytes,
        styleCount,
        styleSharePct: pct(styleBytes, totalBytes),
        fontBytes,
        fontCount,
        fontSharePct: pct(fontBytes, totalBytes),
        otherBytes,
        otherSharePct: pct(otherBytes, totalBytes),
        totalRequests,
        thirdPartyRequests,
        thirdPartyRatioPct: pct(thirdPartyRequests, totalRequests),
        timeToFirstByteMs,
        domContentLoadedMs,
        pageLoadTimeMs,
        estimated4gLatencyMs,
        energyEstimateKWh: calc.energyUsedKWh,
        co2EstimateGrams: calc.co2EstimateGrams,
        co2EstimateGramsPrecise: calc.co2EstimateGramsPrecise,
        carbonScore: calc.carbonScore,
        grade: calc.grade,
        isGreenHost,
        existingFindings,
        assetDetails: input.assetDetails || null,
    };
}

/**
 * Deterministic evidence-based inefficiency detector.
 * Strictly separates measured facts, engineering inferences, and general suggestions,
 * and avoids unsupported claims about physical CPU Joules, server power, or exact CO2 savings.
 */
function extractMeasurableIssues(scan) {
    const issues = [];

    // Zero-byte scan edge case (e.g., blocked crawler, empty redirect, or failed transfer capture)
    if (scan.totalBytes === 0) {
        issues.push({
            id: 'zero-byte-scan',
            category: 'Page Weight',
            severity: 'HIGH',
            issue: 'Zero transferred payload bytes recorded during scan',
            measuredFacts: `The scan recorded 0 transferred bytes across ${scan.totalRequests} HTTP request(s) (${scan.thirdPartyRequests} third-party).`,
            engineeringInference: 'A zero-byte capture typically indicates an aborted response, bot/firewall block, empty redirect, or missing Content-Length headers rather than a zero-footprint website.',
            generalSuggestion: 'Re-run the scan in CarbonLens to capture full transfer telemetry, and verify the target URL responds with HTTP 200 HTML in a standard browser.',
            expectedImprovement: 'Accurate baseline measurements required before performing sustainability analysis or optimization planning.',
            difficulty: 'LOW',
        });
        return issues;
    }

    // 1. Images
    if (scan.imageBytes >= 300 * 1024 || scan.imageSharePct >= 40) {
        const avgImgKB = scan.imageCount > 0 ? bytesToKB(scan.imageBytes / scan.imageCount) : bytesToKB(scan.imageBytes);
        issues.push({
            id: 'oversized-images',
            category: 'Images',
            severity: scan.imageBytes >= 1024 * 1024 || scan.imageSharePct >= 55 ? 'HIGH' : 'MEDIUM',
            issue: 'High image transfer payload',
            measuredFacts: `Images total ${bytesToMB(scan.imageBytes)} MB (${bytesToKB(scan.imageBytes)} KB, ${scan.imageSharePct}% of ${scan.pageWeightMB} MB total page weight) across ${scan.imageCount} image request(s) (mean ${avgImgKB} KB/image).`,
            engineeringInference: 'Because CarbonLens estimates transfer energy proportionally to page weight, large raster image payloads are a primary driver of this page\'s calculated transfer footprint.',
            generalSuggestion: 'Encode photographic/banner assets to WebP or AVIF, resize images to rendered container dimensions, provide responsive srcset variants, and add loading="lazy" to off-screen images.',
            expectedImprovement: 'Reduces image transfer bytes and total page weight, lowering calculated per-visit energy and CO2 estimates.',
            difficulty: 'LOW',
        });
    }

    // 2. JavaScript
    if (scan.scriptBytes >= 150 * 1024 || scan.scriptSharePct >= 25 || scan.scriptCount >= 12) {
        issues.push({
            id: 'excessive-javascript',
            category: 'JavaScript',
            severity: scan.scriptBytes >= 500 * 1024 || scan.scriptSharePct >= 35 ? 'HIGH' : 'MEDIUM',
            issue: 'Substantial JavaScript payload or script request count',
            measuredFacts: `JavaScript totals ${bytesToMB(scan.scriptBytes)} MB (${bytesToKB(scan.scriptBytes)} KB, ${scan.scriptSharePct}% of total page weight) across ${scan.scriptCount} script request(s); measured DOMContentLoaded is ${scan.domContentLoadedMs} ms.`,
            engineeringInference: 'Large script payloads increase transferred bytes in the CarbonLens model and require browser download, parsing, and execution before full interactivity.',
            generalSuggestion: 'Minify JavaScript bundles, remove unused dependencies via tree-shaking, split non-critical route bundles, and apply defer/async on non-blocking scripts.',
            expectedImprovement: 'Reduces transferred script bytes and script request overhead while improving DOM readiness.',
            difficulty: 'MEDIUM',
        });
    }

    // 3. CSS
    if (scan.styleBytes >= 60 * 1024 || scan.styleSharePct >= 15 || scan.styleCount >= 6) {
        issues.push({
            id: 'oversized-css',
            category: 'CSS',
            severity: scan.styleBytes >= 250 * 1024 ? 'HIGH' : 'MEDIUM',
            issue: 'Large or fragmented CSS stylesheet payload',
            measuredFacts: `CSS stylesheets total ${bytesToKB(scan.styleBytes)} KB (${scan.styleSharePct}% of total page weight) across ${scan.styleCount} stylesheet request(s).`,
            engineeringInference: 'Stylesheets are typically render-blocking; oversized or multiple CSS files add transfer bytes and delay initial page rendering.',
            generalSuggestion: 'Minify CSS, purge unused selectors, consolidate redundant stylesheets, and verify text compression (Brotli/Gzip) is enabled.',
            expectedImprovement: 'Reduces CSS transfer weight and stylesheet request count.',
            difficulty: 'LOW',
        });
    }

    // 4. Third-party requests
    if (scan.thirdPartyRequests >= 10 || scan.thirdPartyRatioPct >= 35) {
        issues.push({
            id: 'third-party-overhead',
            category: 'Third-Party Resources',
            severity: scan.thirdPartyRequests >= 25 || scan.thirdPartyRatioPct >= 50 ? 'HIGH' : 'MEDIUM',
            issue: 'High third-party network request share',
            measuredFacts: `${scan.thirdPartyRequests} of ${scan.totalRequests} HTTP requests (${scan.thirdPartyRatioPct}%) target third-party origins.`,
            engineeringInference: 'Third-party origins introduce additional DNS/TLS connections and external asset transfers outside first-party caching control.',
            generalSuggestion: 'Audit third-party scripts, embeds, and trackers; remove non-essential tags, self-host static libraries where permitted, and lazy-load heavy embeds on interaction.',
            expectedImprovement: 'Reduces external HTTP requests and associated third-party transfer weight.',
            difficulty: 'MEDIUM',
        });
    }

    // 5. Total HTTP requests
    if (scan.totalRequests >= 40) {
        issues.push({
            id: 'excessive-http-requests',
            category: 'Network & Requests',
            severity: scan.totalRequests >= 80 ? 'HIGH' : 'MEDIUM',
            issue: 'High total HTTP request count',
            measuredFacts: `The page initiated ${scan.totalRequests} total HTTP requests (${scan.imageCount} images, ${scan.scriptCount} scripts, ${scan.styleCount} stylesheets, ${scan.fontCount} fonts).`,
            engineeringInference: 'High request counts increase HTTP transaction overhead and connection scheduling work during initial uncached page loads.',
            generalSuggestion: 'Remove unused assets, consolidate fragmented resources where appropriate, verify HTTP/2+ multiplexing, and configure long-lived Cache-Control headers for repeat visits.',
            expectedImprovement: 'Reduces network round-trips and improves repeat-visit caching efficiency.',
            difficulty: 'MEDIUM',
        });
    }

    // 6. Total page weight / server text compression (only add if total weight >= 1.5 MB and gives distinct compression/budget guidance)
    if (scan.pageWeightMB >= 1.5 && issues.length < 5) {
        issues.push({
            id: 'heavy-page-weight',
            category: 'Page Weight',
            severity: scan.pageWeightMB >= 3.0 ? 'HIGH' : 'MEDIUM',
            issue: 'Total page transfer weight exceeds 1.5 MB budget threshold',
            measuredFacts: `Measured total transfer weight is ${scan.pageWeightMB} MB (${scan.totalBytes} bytes), yielding a calculated score of ${scan.carbonScore}/100 (Grade ${scan.grade}) and a calculated estimate of ${scan.co2EstimateGrams} g CO2 per view.`,
            engineeringInference: 'In the CarbonLens 0.06 kWh/GB transfer model, calculated energy and CO2 estimates scale linearly with total transferred bytes.',
            generalSuggestion: 'Establish a CI page-weight budget (e.g., <= 1.0 MB), verify Brotli or Gzip compression on text assets, and prioritize optimizing the largest asset category first.',
            expectedImprovement: 'Lowers total transferred MB and improves the calculated CarbonLens sustainability score.',
            difficulty: 'MEDIUM',
        });
    }

    // 7. Fonts
    if (scan.fontBytes >= 100 * 1024 || scan.fontCount >= 4) {
        issues.push({
            id: 'font-overhead',
            category: 'Fonts',
            severity: 'LOW',
            issue: 'Web font transfer volume',
            measuredFacts: `${scan.fontCount} web font request(s) transferred ${bytesToKB(scan.fontBytes)} KB (${scan.fontSharePct}% of total page weight).`,
            engineeringInference: 'Multiple font weights or unsubsetted font files add extra transfer bytes and can delay text visibility.',
            generalSuggestion: 'Serve WOFF2 fonts, subset character sets to needed scripts, limit loaded weights, and apply font-display: swap.',
            expectedImprovement: 'Reduces font payload bytes and accelerates text rendering.',
            difficulty: 'LOW',
        });
    }

    // 8. Timing & caching (strictly without unmeasured server hardware claims)
    if (scan.timeToFirstByteMs >= 600 || scan.pageLoadTimeMs >= 3000) {
        issues.push({
            id: 'elevated-load-latency',
            category: 'Performance & Caching',
            severity: scan.timeToFirstByteMs >= 1200 || scan.pageLoadTimeMs >= 5000 ? 'HIGH' : 'MEDIUM',
            issue: 'Elevated TTFB or overall page load latency',
            measuredFacts: `Measured timing telemetry: TTFB = ${scan.timeToFirstByteMs} ms, DOMContentLoaded = ${scan.domContentLoadedMs} ms, Page Load = ${scan.pageLoadTimeMs} ms.`,
            engineeringInference: 'High TTFB or multi-second load durations commonly reflect uncached origin/HTML responses, CDN distance, or render-blocking asset chains.',
            generalSuggestion: 'Enable edge/CDN caching for cacheable documents and static assets, set appropriate Cache-Control headers, and preload critical above-the-fold resources.',
            expectedImprovement: 'Reduces response latency and improves repeat-visit cache hit behavior.',
            difficulty: 'MEDIUM',
        });
    }

    // 9. Green hosting directory status
    if (!scan.isGreenHost) {
        issues.push({
            id: 'non-green-hosting',
            category: 'Hosting',
            severity: 'LOW',
            issue: 'Host not verified in Green Web Foundation directory',
            measuredFacts: `The Green Web Foundation API returned green=false for this domain, so CarbonLens applied the standard 442 gCO2/kWh calculation factor rather than 312 gCO2/kWh.`,
            engineeringInference: 'Because the host is not verified in the Green Web Foundation dataset, the calculated CO2 estimate uses the higher grid carbon intensity factor (actual data-center electricity mix is not directly measured by the scanner).',
            generalSuggestion: 'Check whether your hosting or CDN provider offers verified renewable energy registration in the Green Web Foundation directory, or consider green-verified infrastructure.',
            expectedImprovement: 'Lowers the assumed carbon intensity factor used in sustainability calculations if migrated to verified green hosting.',
            difficulty: 'HIGH',
        });
    }

    if (issues.length === 0) {
        issues.push({
            id: 'maintain-efficiency-caching',
            category: 'Performance & Caching',
            severity: 'LOW',
            issue: 'Lightweight page — protect current transfer budget',
            measuredFacts: `Measured total weight is ${scan.pageWeightMB} MB (${bytesToKB(scan.totalBytes)} KB) across ${scan.totalRequests} requests; calculated score is ${scan.carbonScore}/100 (Grade ${scan.grade}).`,
            engineeringInference: 'Current measured asset weight is below major bloat thresholds; preventing regressions requires ongoing asset governance.',
            generalSuggestion: 'Maintain asset size budgets in CI, verify Brotli/Gzip compression, and enforce immutable Cache-Control headers for static files.',
            expectedImprovement: 'Preserves low page weight and high sustainability score as content evolves.',
            difficulty: 'LOW',
        });
    }

    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
    return issues.slice(0, 6);
}

/**
 * Validates and normalizes AI JSON response strictly against CarbonLens 2.0 schema.
 * Throws descriptive errors if invalid JSON or missing required fields.
 */
function validateAgentResponse(rawContent) {
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
        throw new Error('EMPTY_AI_RESPONSE');
    }

    const cleaned = rawContent
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch (err) {
        throw new Error(`INVALID_JSON: ${err.message}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('INVALID_SCHEMA: Root response must be a JSON object.');
    }

    if (typeof parsed.overallAssessment !== 'string' || parsed.overallAssessment.trim().length < 20) {
        throw new Error('MISSING_FIELD: overallAssessment must be a meaningful string.');
    }

    if (!Array.isArray(parsed.recommendations) || parsed.recommendations.length === 0) {
        throw new Error('MISSING_FIELD: recommendations must be a non-empty array.');
    }

    const normalizedRecommendations = parsed.recommendations.slice(0, 6).map((rec, index) => {
        if (!rec || typeof rec !== 'object') {
            throw new Error(`INVALID_ITEM: recommendations[${index}] must be an object.`);
        }

        const measuredFacts = String(rec.measuredFacts ?? rec.evidenceFromScan ?? '').trim();
        const engineeringInference = String(rec.engineeringInference ?? rec.whyItMatters ?? '').trim();
        const generalSuggestion = String(rec.generalSuggestion ?? rec.recommendedSolution ?? '').trim();
        const issueIdentified = String(rec.issueIdentified ?? '').trim();
        const expectedImprovement = String(rec.expectedImprovement ?? '').trim();

        if (issueIdentified.length < 8) {
            throw new Error(`MISSING_FIELD: recommendations[${index}].issueIdentified is missing or too short.`);
        }
        if (measuredFacts.length < 8) {
            throw new Error(`MISSING_FIELD: recommendations[${index}].measuredFacts (or evidenceFromScan) is missing or too short.`);
        }
        if (engineeringInference.length < 8) {
            throw new Error(`MISSING_FIELD: recommendations[${index}].engineeringInference (or whyItMatters) is missing or too short.`);
        }
        if (generalSuggestion.length < 8) {
            throw new Error(`MISSING_FIELD: recommendations[${index}].generalSuggestion (or recommendedSolution) is missing or too short.`);
        }
        if (expectedImprovement.length < 8) {
            throw new Error(`MISSING_FIELD: recommendations[${index}].expectedImprovement is missing or too short.`);
        }

        const priority = String(rec.priority || '').toUpperCase().trim();
        if (!VALID_PRIORITIES.includes(priority)) {
            throw new Error(`INVALID_PRIORITY: recommendations[${index}].priority="${rec.priority}"`);
        }

        const difficulty = String(rec.estimatedImplementationDifficulty || '').toUpperCase().trim();
        if (!VALID_DIFFICULTIES.includes(difficulty)) {
            throw new Error(
                `INVALID_DIFFICULTY: recommendations[${index}].estimatedImplementationDifficulty="${rec.estimatedImplementationDifficulty}"`
            );
        }

        const rawCategory = String(rec.resourceCategory || '').trim();
        const resourceCategory = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : rawCategory || 'Page Weight';

        return {
            issueIdentified,
            measuredFacts,
            engineeringInference,
            generalSuggestion,
            // Preserve legacy field aliases so any existing consumers continue working seamlessly
            evidenceFromScan: measuredFacts,
            whyItMatters: engineeringInference,
            recommendedSolution: generalSuggestion,
            expectedImprovement,
            estimatedImplementationDifficulty: difficulty,
            priority,
            resourceCategory,
        };
    });

    // Deduplicate by resourceCategory + issueIdentified to prevent repetitive recommendations
    const seen = new Set();
    const deduped = normalizedRecommendations.filter((item) => {
        const key = `${item.resourceCategory.toLowerCase()}::${item.issueIdentified.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    deduped.sort((a, b) => rank[a.priority] - rank[b.priority]);

    return {
        overallAssessment: parsed.overallAssessment.trim(),
        recommendations: deduped,
    };
}

function buildDeterministicFallbackReport(scan, detectedIssues, fallbackReason) {
    const topCategory = (() => {
        const cats = [
            { name: 'Images', bytes: scan.imageBytes, pct: scan.imageSharePct },
            { name: 'JavaScript', bytes: scan.scriptBytes, pct: scan.scriptSharePct },
            { name: 'CSS', bytes: scan.styleBytes, pct: scan.styleSharePct },
            { name: 'Fonts', bytes: scan.fontBytes, pct: scan.fontSharePct },
            { name: 'Other assets', bytes: scan.otherBytes, pct: scan.otherSharePct },
        ].sort((a, b) => b.bytes - a.bytes);
        return cats[0];
    })();

    const highCount = detectedIssues.filter((i) => i.severity === 'HIGH').length;
    const overallAssessment =
        `Deterministic fallback assessment for ${scan.targetUrl}: measured total transfer is ${scan.pageWeightMB} MB (${scan.totalBytes} bytes) across ${scan.totalRequests} HTTP requests ` +
        `(${scan.thirdPartyRequests} third-party). Calculated sustainability score is ${scan.carbonScore}/100 (Grade ${scan.grade}) ` +
        `with calculated estimates of ${scan.energyEstimateKWh} kWh energy and ${scan.co2EstimateGrams} g CO2 per view ` +
        `(${scan.isGreenHost ? 'Green Web Foundation verified: 312 gCO2/kWh' : 'Not verified green: 442 gCO2/kWh factor'}). ` +
        `Largest measured category: ${topCategory.name} (${bytesToKB(topCategory.bytes)} KB, ${topCategory.pct}%). ` +
        `Identified ${detectedIssues.length} prioritized item(s) (${highCount} HIGH). Advisory only — no website was modified.`;

    const recommendations = detectedIssues.map((item) => ({
        issueIdentified: item.issue,
        measuredFacts: item.measuredFacts,
        engineeringInference: item.engineeringInference,
        generalSuggestion: item.generalSuggestion,
        evidenceFromScan: item.measuredFacts,
        whyItMatters: item.engineeringInference,
        recommendedSolution: item.generalSuggestion,
        expectedImprovement: item.expectedImprovement,
        estimatedImplementationDifficulty: item.difficulty,
        priority: item.severity,
        resourceCategory: item.category,
    }));

    return {
        analysisId: scan.analysisId,
        targetUrl: scan.targetUrl,
        provenance: 'RULE-BASED',
        generationMode: 'deterministic_fallback',
        modelName: null,
        fallbackReason: fallbackReason || 'Gemini API unavailable',
        disclaimer:
            'RULE-BASED deterministic fallback analysis (NOT generated by Gemini). Calculated from real scan evidence only — does not modify any website. Energy and CO2 figures are calculated estimates, not direct physical measurements.',
        overallAssessment,
        scanEvidence: {
            provenance: {
                bytesAndRequestsAndTimings: 'MEASURED',
                energyAndCo2AndScore: 'CALCULATED',
            },
            measurementTimestamp: scan.createdAt || new Date().toISOString(),
            totalBytes: scan.totalBytes,
            pageWeightMB: scan.pageWeightMB,
            imageBytes: scan.imageBytes,
            imageSharePct: scan.imageSharePct,
            imageCount: scan.imageCount,
            scriptBytes: scan.scriptBytes,
            scriptSharePct: scan.scriptSharePct,
            scriptCount: scan.scriptCount,
            styleBytes: scan.styleBytes,
            styleSharePct: scan.styleSharePct,
            styleCount: scan.styleCount,
            fontBytes: scan.fontBytes,
            fontSharePct: scan.fontSharePct,
            fontCount: scan.fontCount,
            otherBytes: scan.otherBytes,
            otherSharePct: scan.otherSharePct,
            totalRequests: scan.totalRequests,
            thirdPartyRequests: scan.thirdPartyRequests,
            thirdPartyRatioPct: scan.thirdPartyRatioPct,
            timeToFirstByteMs: scan.timeToFirstByteMs,
            domContentLoadedMs: scan.domContentLoadedMs,
            pageLoadTimeMs: scan.pageLoadTimeMs,
            energyEstimateKWh: scan.energyEstimateKWh,
            co2EstimateGrams: scan.co2EstimateGrams,
            co2EstimateGramsPrecise: scan.co2EstimateGramsPrecise,
            carbonScore: scan.carbonScore,
            grade: scan.grade,
            carbonIntensity: scan.isGreenHost ? 312 : 442,
            isGreenHost: scan.isGreenHost,
        },
        recommendations,
        generatedAt: new Date().toISOString(),
    };
}

function buildAgentPrompt(scan, detectedIssues) {
    return `Analyze these REAL website scan measurements and return a concise JSON sustainability report.

RULES:
1. Cite ONLY numbers present in the scan measurements below. Never invent metrics or exact carbon/energy savings.
2. Do NOT claim CPU Joule energy consumption, server hardware power draw, or that you modified the website.
3. Explicitly separate:
   - "measuredFacts": exact scan numbers observed
   - "engineeringInference": technical reasoning inferred from those measurements
   - "generalSuggestion": actionable optimization steps
4. Return ONLY valid JSON (no markdown fences). Keep each field concise (1-2 sentences).

SCAN MEASUREMENTS:
- URL: ${scan.targetUrl}
- Total: ${scan.pageWeightMB} MB (${scan.totalBytes} bytes)
- Images: ${scan.imageCount} reqs, ${bytesToKB(scan.imageBytes)} KB (${scan.imageSharePct}%)
- JavaScript: ${scan.scriptCount} reqs, ${bytesToKB(scan.scriptBytes)} KB (${scan.scriptSharePct}%)
- CSS: ${scan.styleCount} reqs, ${bytesToKB(scan.styleBytes)} KB (${scan.styleSharePct}%)
- Fonts: ${scan.fontCount} reqs, ${bytesToKB(scan.fontBytes)} KB (${scan.fontSharePct}%)
- Other: ${bytesToKB(scan.otherBytes)} KB (${scan.otherSharePct}%)
- Requests: ${scan.totalRequests} total, ${scan.thirdPartyRequests} third-party (${scan.thirdPartyRatioPct}%)
- Timing: TTFB=${scan.timeToFirstByteMs}ms, DOMContentLoaded=${scan.domContentLoadedMs}ms, Load=${scan.pageLoadTimeMs}ms
- Calculated Estimates (0.06 kWh/GB): energy=${scan.energyEstimateKWh} kWh, CO2=${scan.co2EstimateGrams} g, score=${scan.carbonScore}/100 (Grade ${scan.grade})
- Green Web Foundation: ${scan.isGreenHost ? 'Verified green (312 gCO2/kWh)' : 'Not verified (442 gCO2/kWh)'}
- Signals: ${detectedIssues.map((i) => `[${i.severity}] ${i.issue}`).join('; ')}

JSON SCHEMA:
{
  "overallAssessment": "2-3 sentence summary citing key measured figures and noting energy/CO2 are calculated estimates.",
  "recommendations": [
    {
      "issueIdentified": "Specific issue supported by scan",
      "measuredFacts": "Exact numbers from the scan proving this issue",
      "engineeringInference": "Why this matters technically (no unsupported CPU/hardware energy claims)",
      "generalSuggestion": "Concrete engineering remediation steps",
      "expectedImprovement": "Qualitative direction of improvement only (no fabricated CO2 numbers)",
      "estimatedImplementationDifficulty": "LOW" | "MEDIUM" | "HIGH",
      "priority": "HIGH" | "MEDIUM" | "LOW",
      "resourceCategory": "Images" | "JavaScript" | "CSS" | "Fonts" | "Network & Requests" | "Third-Party Resources" | "Hosting" | "Performance & Caching" | "Page Weight"
    }
  ]
}

Provide 3 to 5 distinct, non-repetitive recommendations ordered HIGH to LOW.`;
}

function createOpenAiClient() {
    if (!process.env.AI_API_KEY) return null;
    return new OpenAI({
        apiKey: process.env.AI_API_KEY,
        baseURL: DEFAULT_AI_BASE_URL,
    });
}

async function callWithTimeout(promiseFactory, timeoutMs) {
    const controller = new AbortController();
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            const err = new Error(`AI request timed out after ${timeoutMs}ms`);
            err.code = 'AI_TIMEOUT';
            reject(err);
        }, timeoutMs);
    });

    try {
        return await Promise.race([promiseFactory(controller.signal), timeoutPromise]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Runs the CarbonLens 2.0 AI Sustainability Agent.
 * Supports dependency injection (`options.llmClient`) for deterministic unit testing of
 * valid JSON, invalid JSON, missing fields, API errors, rate limits, and timeouts.
 */
async function runSustainabilityAgent(rawInput, options = {}) {
    const scan = buildStructuredScanInput(rawInput);
    const detectedIssues = extractMeasurableIssues(scan);
    const timeoutMs = Number(options.timeoutMs) || DEFAULT_AI_TIMEOUT_MS;
    const modelName = options.modelName || DEFAULT_AI_MODEL;
    const client = options.llmClient !== undefined ? options.llmClient : createOpenAiClient();

    if (!client) {
        return buildDeterministicFallbackReport(
            scan,
            detectedIssues,
            'AI_API_KEY not configured — using deterministic evidence-based sustainability engine.'
        );
    }

    // Zero-byte scans lack payload measurements; avoid asking Gemini to speculate on empty data
    if (scan.totalBytes === 0 && !options.allowZeroByteLlm) {
        return buildDeterministicFallbackReport(
            scan,
            detectedIssues,
            'Scan recorded 0 transferred bytes — deterministic diagnostic returned instead of invoking Gemini on empty telemetry.'
        );
    }

    const prompt = buildAgentPrompt(scan, detectedIssues);

    try {
        const response = await callWithTimeout(
            (signal) => {
                const payload = {
                    model: modelName,
                    messages: [
                        {
                            role: 'system',
                            content:
                                'You are the CarbonLens 2.0 AI Sustainability Agent. Respond strictly with valid JSON matching the requested schema.',
                        },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.2,
                };
                if (/gemini-2\.5/i.test(modelName)) {
                    payload.reasoning_effort = 'low';
                }
                payload.response_format = { type: 'json_object' };
                return client.chat.completions.create(payload, { signal, timeout: timeoutMs });
            },
            timeoutMs
        );

        const rawContent = response?.choices?.[0]?.message?.content;
        const validated = validateAgentResponse(rawContent);

        return {
            analysisId: scan.analysisId,
            targetUrl: scan.targetUrl,
            provenance: 'AI-GENERATED',
            generationMode: 'gemini',
            modelName,
            tokenUsage: response?.usage || null,
            fallbackReason: null,
            disclaimer:
                'AI-GENERATED recommendations grounded in MEASURED scan telemetry. Advisory only — does not modify any website. Energy and CO2 figures are CALCULATED estimates, not direct physical measurements.',
            overallAssessment: validated.overallAssessment,
            scanEvidence: buildDeterministicFallbackReport(scan, detectedIssues).scanEvidence,
            recommendations: validated.recommendations,
            generatedAt: new Date().toISOString(),
        };
    } catch (error) {
        const reason =
            error?.status === 429
                ? 'Gemini API rate limit (HTTP 429) — fell back to deterministic evidence engine.'
                : error?.code === 'AI_TIMEOUT' || error?.name === 'AbortError'
                    ? `Gemini API timeout (${timeoutMs}ms) — fell back to deterministic evidence engine.`
                    : `Gemini API/validation error (${error?.message || 'unknown'}) — fell back to deterministic evidence engine.`;

        return buildDeterministicFallbackReport(scan, detectedIssues, reason);
    }
}

module.exports = {
    runSustainabilityAgent,
    buildStructuredScanInput,
    extractMeasurableIssues,
    validateAgentResponse,
    buildDeterministicFallbackReport,
    VALID_PRIORITIES,
    VALID_DIFFICULTIES,
    VALID_CATEGORIES,
};
