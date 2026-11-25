// backend/services/catboostService.js
// Module 5: CatBoost Carbon Prediction — Architecture-Ready Interface (Training Pending)
// Strictly adheres to scientific integrity rules:
//   - No fabricated model weights, predictions, MAE, RMSE, R2, or feature importance values.
//   - Provides real feature extraction from CarbonLens scans and a clean plug-in contract
//     for a future trained CatBoost model served via a separate Python inference sidecar.

const CATBOOST_FEATURE_SCHEMA = [
    { name: 'total_bytes', type: 'numeric', unit: 'bytes', source: 'Playwright network telemetry' },
    { name: 'page_weight_mb', type: 'numeric', unit: 'MB', source: 'Derived from total_bytes' },
    { name: 'image_bytes', type: 'numeric', unit: 'bytes', source: 'Playwright image responses' },
    { name: 'image_share_ratio', type: 'numeric', unit: 'ratio [0..1]', source: 'image_bytes / total_bytes' },
    { name: 'script_bytes', type: 'numeric', unit: 'bytes', source: 'Playwright script responses' },
    { name: 'script_share_ratio', type: 'numeric', unit: 'ratio [0..1]', source: 'script_bytes / total_bytes' },
    { name: 'style_bytes', type: 'numeric', unit: 'bytes', source: 'Playwright stylesheet responses' },
    { name: 'style_share_ratio', type: 'numeric', unit: 'ratio [0..1]', source: 'style_bytes / total_bytes' },
    { name: 'font_bytes', type: 'numeric', unit: 'bytes', source: 'Playwright font responses' },
    { name: 'other_bytes', type: 'numeric', unit: 'bytes', source: 'Remaining document/API payload bytes' },
    { name: 'total_requests', type: 'integer', unit: 'count', source: 'Playwright HTTP request count' },
    { name: 'third_party_requests', type: 'integer', unit: 'count', source: 'Cross-origin HTTP requests' },
    { name: 'third_party_ratio', type: 'numeric', unit: 'ratio [0..1]', source: 'third_party_requests / total_requests' },
    { name: 'image_count', type: 'integer', unit: 'count', source: 'Image resource count' },
    { name: 'script_count', type: 'integer', unit: 'count', source: 'Script resource count' },
    { name: 'style_count', type: 'integer', unit: 'count', source: 'Stylesheet resource count' },
    { name: 'font_count', type: 'integer', unit: 'count', source: 'Font resource count' },
    { name: 'ttfb_ms', type: 'numeric', unit: 'ms', source: 'Navigation Timing API (responseStart)' },
    { name: 'dom_content_loaded_ms', type: 'numeric', unit: 'ms', source: 'Navigation Timing API' },
    { name: 'page_load_time_ms', type: 'numeric', unit: 'ms', source: 'Navigation Timing API' },
    { name: 'is_green_host', type: 'categorical_binary', unit: '0 | 1', source: 'Green Web Foundation API v3' },
];

function safeRatio(num, den) {
    if (!den || den <= 0) return 0;
    return Number((num / den).toFixed(6));
}

/**
 * Extracts a clean, deterministic ML feature vector from a real CarbonLens scan row.
 */
function extractFeaturesFromScan(scanRow = {}) {
    const imageBytes = Math.max(0, Number(scanRow.image_bytes ?? scanRow.imageBytes) || 0);
    const scriptBytes = Math.max(0, Number(scanRow.script_bytes ?? scanRow.scriptBytes) || 0);
    const styleBytes = Math.max(0, Number(scanRow.style_bytes ?? scanRow.styleBytes) || 0);
    const fontBytes = Math.max(0, Number(scanRow.font_bytes ?? scanRow.fontBytes) || 0);
    const knownBytes = imageBytes + scriptBytes + styleBytes + fontBytes;

    let totalBytes = Math.max(
        0,
        Number(scanRow.totalBytes) || Math.round((Number(scanRow.page_size ?? scanRow.pageWeightMB) || 0) * 1024 * 1024)
    );
    if (totalBytes < knownBytes) totalBytes = knownBytes;
    const otherBytes = Math.max(0, totalBytes - knownBytes);

    const totalRequests = Math.max(0, Math.floor(Number(scanRow.total_requests ?? scanRow.totalRequests) || 0));
    const thirdPartyRequests = Math.min(
        totalRequests,
        Math.max(0, Math.floor(Number(scanRow.third_party_requests ?? scanRow.thirdPartyRequests) || 0))
    );

    const payload = scanRow.analysis_payload || {};
    const speedMetrics = payload.PHASE_3_SPEED_METRICS_TRANSCRIPT?.METRICS || {};
    const parseMs = (val) => {
        if (typeof val === 'number') return Math.max(0, val);
        const match = String(val || '').match(/([\d.]+)/);
        return match ? Math.max(0, Number(match[1])) : 0;
    };

    return {
        total_bytes: totalBytes,
        page_weight_mb: Number((totalBytes / (1024 * 1024)).toFixed(4)),
        image_bytes: imageBytes,
        image_share_ratio: safeRatio(imageBytes, totalBytes),
        script_bytes: scriptBytes,
        script_share_ratio: safeRatio(scriptBytes, totalBytes),
        style_bytes: styleBytes,
        style_share_ratio: safeRatio(styleBytes, totalBytes),
        font_bytes: fontBytes,
        other_bytes: otherBytes,
        total_requests: totalRequests,
        third_party_requests: thirdPartyRequests,
        third_party_ratio: safeRatio(thirdPartyRequests, totalRequests),
        image_count: Math.max(0, Math.floor(Number(scanRow.image_count ?? scanRow.imageCount) || 0)),
        script_count: Math.max(0, Math.floor(Number(scanRow.script_count ?? scanRow.scriptCount) || 0)),
        style_count: Math.max(0, Math.floor(Number(scanRow.style_count ?? scanRow.styleCount) || 0)),
        font_count: Math.max(0, Math.floor(Number(scanRow.font_count ?? scanRow.fontCount) || 0)),
        ttfb_ms: Math.round(parseMs(scanRow.timeToFirstByteMs ?? speedMetrics.SERVER_RESPONSE_LAG_TTFB)),
        dom_content_loaded_ms: Math.round(
            parseMs(scanRow.domContentLoadedMs ?? speedMetrics.DOM_STRUCTURAL_READINESS)
        ),
        page_load_time_ms: Math.round(
            parseMs(scanRow.pageLoadTimeMs ?? speedMetrics.TOTAL_VISUAL_RENDER_TIME)
        ),
        is_green_host: scanRow.is_green_host || scanRow.isGreenHost ? 1 : 0,
    };
}

function getModelStatus() {
    return {
        modelName: 'CatBoost Carbon & Sustainability Predictor',
        status: 'TRAINING_PENDING',
        banner: 'CatBoost Model — Training and Evaluation Pending',
        trained: false,
        version: null,
        artifactPath: null,
        featureCount: CATBOOST_FEATURE_SCHEMA.length,
        featureSchema: CATBOOST_FEATURE_SCHEMA,
        plannedTargets: [
            {
                name: 'co2_grams_per_visit',
                type: 'regression',
                note: 'Non-linear carbon/energy estimate incorporating transfer size, client execution overhead (JS/DOM timing), request overhead, and hosting greenness.',
            },
            {
                name: 'sustainability_risk_tier',
                type: 'multiclass_classification',
                note: 'Optional secondary target classifying pages into sustainability efficiency bands.',
            },
        ],
        plannedEvaluationMetrics: {
            MAE: null,
            RMSE: null,
            R2: null,
            crossValidationFolds: 5,
            status: 'NOT_YET_EVALUATED',
        },
        plannedIntegrationArchitecture: {
            runtime: 'Separate Python FastAPI/Flask microservice or CLI worker loading serialized .cbm CatBoost artifact',
            nodeBridge: 'backend/services/catboostService.js invokes CATBOOST_SERVICE_URL when configured',
            leakagePrevention: 'Domain-grouped train/validation/test split; zero formula-target circularity when predicting measured/benchmark targets',
            documentation: 'CARBONLENS_CATBOOST_FUTURE_IMPLEMENTATION.md',
        },
    };
}

async function predictWithCatBoost() {
    const err = new Error(
        'CatBoost model training and evaluation are currently pending. No trained model artifact is loaded.'
    );
    err.code = 'MODEL_NOT_TRAINED';
    err.statusCode = 503;
    throw err;
}

module.exports = {
    CATBOOST_FEATURE_SCHEMA,
    extractFeaturesFromScan,
    getModelStatus,
    predictWithCatBoost,
};
