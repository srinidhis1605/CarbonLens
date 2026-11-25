// backend/services/normalizationService.js
const axios = require('axios');

/**
 * Strips EVERYTHING out of a URL to isolate a clean hostname for the Greencheck API
 */
function extractDomain(url) {
    try {
        if (!url) return '';
        
        // 1. Clean up accidental trailing or leading spaces
        let cleanedUrl = url.trim();
        
        // 2. Ensure a protocol exists so the URL parser behaves predictably
        if (!/^https?:\/\//i.test(cleanedUrl)) {
            cleanedUrl = 'http://' + cleanedUrl;
        }
        
        // 3. Extract the clean hostname
        let hostname = new URL(cleanedUrl).hostname;
        
        // 4. Strip out any remaining 'www.' prefix as requested by their docs
        hostname = hostname.replace(/^www\./i, '');
        
        // 5. Final fallback defense: remove trailing slashes or path symbols if any sneaked through
        return hostname.split('/')[0].split(':')[0]; 
    } catch (e) {
        // Safe pure text regex backup if the URL constructor fails
        let domain = url.replace(/^(https?:\/\/)?(www\.)?/i, '');
        return domain.split('/')[0].split(':')[0].trim();
    }
}

const ENERGY_KWH_PER_GB = 0.06;
const CARBON_INTENSITY_GREEN = 312;
const CARBON_INTENSITY_STANDARD = 442;
const SCORE_DECAY_COEFFICIENT = 0.15;

function calculateGrade(score) {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 65) return 'C';
    if (score >= 50) return 'D';
    if (score >= 35) return 'E';
    return 'F';
}

function isLocalOrPrivateHost(domain) {
    const clean = String(domain || '').toLowerCase().trim();
    return (
        clean === 'localhost' ||
        clean === '127.0.0.1' ||
        clean === '::1' ||
        clean.endsWith('.local') ||
        /^10\./.test(clean) ||
        /^192\.168\./.test(clean)
    );
}

/**
 * Pure, deterministic CarbonLens sustainability calculation engine.
 * Reused across live scans, What-if simulations, and Before-and-After validation.
 * Note: Energy and CO2 outputs are calculated estimates, not direct physical measurements.
 */
function calculateSustainabilityMetrics({ totalBytes = 0, isGreenHost = false } = {}) {
    const safeBytes = Math.max(0, Number(totalBytes) || 0);
    const totalWeightMB = safeBytes / (1024 * 1024);
    const totalWeightGB = safeBytes / (1024 * 1024 * 1024);
    const green = Boolean(isGreenHost);

    const energyUsedKWh = totalWeightGB * ENERGY_KWH_PER_GB;
    const carbonIntensity = green ? CARBON_INTENSITY_GREEN : CARBON_INTENSITY_STANDARD;
    const co2RawGrams = energyUsedKWh * carbonIntensity;
    const co2EstimateGrams = parseFloat(co2RawGrams.toFixed(4)) || 0;
    const carbonScore = Math.round(100 * Math.exp(-SCORE_DECAY_COEFFICIENT * totalWeightMB));
    const grade = calculateGrade(carbonScore);

    return {
        totalBytes: safeBytes,
        pageWeightMB: totalWeightMB,
        totalWeightGB,
        energyUsedKWh: Number(energyUsedKWh.toFixed(8)),
        carbonIntensity,
        co2EstimateGrams,
        co2EstimateGramsPrecise: Number(co2RawGrams.toFixed(6)),
        carbonScore,
        grade,
        isGreenHost: green,
        methodology: {
            type: 'CALCULATED_ESTIMATE',
            energyPerGBKWh: ENERGY_KWH_PER_GB,
            carbonIntensityGPerKWh: carbonIntensity,
            scoreFormula: 'round(100 * exp(-0.15 * pageWeightMB))',
        },
    };
}

/**
 * Checks if a host domain operates on renewable green energy grids
 */
async function checkGreenHosting(url) {
    const domain = extractDomain(url);

    if (isLocalOrPrivateHost(domain)) {
        return false;
    }
    
    // Debug log to see exactly what string is being thrown at the API socket
    console.log(`[Greencheck Vector] Querying clean hostname: "${domain}"`);
    
    try {
        const response = await axios.get(`https://api.thegreenwebfoundation.org/api/v3/greencheck/${domain}`, {
            timeout: 2500,
            headers: {
                'User-Agent': 'CarbonLens-Sustainability-App/1.0'
            }
        });
        
        return response.data && response.data.green === true;
    } catch (error) {
        console.warn(`Green Host API unreachable for "${domain}", defaulting to false. Status: ${error.response ? error.response.status : error.message}`);
        return false;
    }
}

/**
 * Normalizes raw byte variables, builds exponential grades, checks hosting grids,
 * and appends Phase 3 speed telemetry.
 *
 * @param {string} url
 * @param {object} rawMetrics - networkMetrics from analyzeUrlPerformanceOnly()
 * @param {object} speedMetrics - speedMetrics from analyzeUrlPerformanceOnly()
 */
async function normalizeAnalysisData(url, rawMetrics, speedMetrics = {}, options = {}) {
    const totalBytes = Number(rawMetrics?.totalBytes) || 0;

    // Green Web API hosting check (can be pre-fetched in parallel with the browser scan)
    const isGreenHost =
        typeof options.isGreenHost === 'boolean'
            ? options.isGreenHost
            : await checkGreenHosting(url);

    const calc = calculateSustainabilityMetrics({ totalBytes, isGreenHost });

    return {
        // Existing sustainability / page-weight metrics (100% backward-compatible)
        pageWeightMB: calc.pageWeightMB,
        carbonScore: calc.carbonScore,
        co2EstimateGrams: calc.co2EstimateGrams,
        isGreenHost: calc.isGreenHost,

        // CarbonLens 2.0 additive calculated-estimate fields
        energyUsedKWh: calc.energyUsedKWh,
        carbonIntensity: calc.carbonIntensity,
        co2EstimateGramsPrecise: calc.co2EstimateGramsPrecise,
        grade: calc.grade,

        // Phase 3 Speed Metrics
        timeToFirstByteMs: Number(speedMetrics?.timeToFirstByteMs) || 0,
        domContentLoadedMs: Number(speedMetrics?.domContentLoadedMs) || 0,
        pageLoadTimeMs: Number(speedMetrics?.pageLoadTimeMs) || 0,
        estimated4gLatencyMs: Number(speedMetrics?.estimated4gLatencyMs) || 0
    };
}

module.exports = {
    normalizeAnalysisData,
    checkGreenHosting,
    calculateSustainabilityMetrics,
    calculateGrade,
    extractDomain,
    ENERGY_KWH_PER_GB,
    CARBON_INTENSITY_GREEN,
    CARBON_INTENSITY_STANDARD,
    SCORE_DECAY_COEFFICIENT,
};