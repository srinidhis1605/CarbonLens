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

/**
 * Checks if a host domain operates on renewable green energy grids
 */
async function checkGreenHosting(url) {
    const domain = extractDomain(url);
    
    // Debug log to see exactly what string is being thrown at the API socket
    console.log(`[Greencheck Vector] Querying clean hostname: "${domain}"`);
    
    try {
        const response = await axios.get(`https://api.thegreenwebfoundation.org/api/v3/greencheck/${domain}`, {
            timeout: 4000,
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
 * Normalizes raw byte variables, builds exponential grades, and checks hosting grids
 */
async function normalizeAnalysisData(url, rawMetrics) {
    const totalBytes = Number(rawMetrics?.totalBytes) || 0;
    const totalWeightMB = totalBytes / (1024 * 1024);

    // Call our cleaned check function
    const isGreenHost = await checkGreenHosting(url);

    // Dynamic Carbon Emission Modifier (Day 5 Goal)
    const co2Multiplier = isGreenHost ? 0.15 : 0.50;
    const co2EstimateGrams = (totalWeightMB * co2Multiplier).toFixed(4);

    // Curve scaling
    const scalingFactor = 0.15;
    let carbonScore = Math.round(100 * Math.exp(-scalingFactor * totalWeightMB));
    
    if (carbonScore < 0) carbonScore = 0;
    if (carbonScore > 100) carbonScore = 100;

    return {
        pageWeightMB: Math.min(99999.99, Math.max(0, totalWeightMB)),
        carbonScore: carbonScore,
        co2EstimateGrams: Math.min(99999.99, Math.max(0, parseFloat(co2EstimateGrams) || 0)),
        isGreenHost: isGreenHost
    };
}

module.exports = { normalizeAnalysisData };