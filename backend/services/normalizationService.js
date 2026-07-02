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
    // 1. Convert raw bytes from Playwright into Gigabytes (GB)
    const totalBytes = Number(rawMetrics?.totalBytes) || 0;
    const totalWeightMB = totalBytes / (1024 * 1024);
    const totalWeightGB = totalBytes / (1024 * 1024 * 1024);

    // 2. This is your Green Web API function call that you just fixed!
    const isGreenHost = await checkGreenHosting(url);

    // 3. DAY 8 FORMULA: Calculate total energy based on the 0.06 kWh per GB constant
    const energyPerGB = 0.06; 
    const energyUsedKWh = totalWeightGB * energyPerGB;

    // 4. CHOOSE GRID INTENSITY BASED ON YOUR GREEN WEB API RESULT
    // If the API said true, we use 312. If false, we use 442.
    const carbonIntensity = isGreenHost ? 312 : 442;
    
    // 5. Calculate final grams of CO2
    const co2EstimateGrams = (energyUsedKWh * carbonIntensity).toFixed(4);

    return {
        pageWeightMB: totalWeightMB,
        carbonScore: Math.round(100 * Math.exp(-0.15 * totalWeightMB)),
        co2EstimateGrams: parseFloat(co2EstimateGrams) || 0,
        isGreenHost: isGreenHost // Passed right to your DB handler!
    };
}

module.exports = { normalizeAnalysisData };