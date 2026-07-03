// backend/services/analysisService.js
const { chromium } = require('playwright');

const analyzeUrl = async (url) => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Explicitly initialize the object structure with guaranteed baseline values
    const metrics = {
        totalBytes: 0,
        imageBytes: 0,
        scriptBytes: 0,
        styleBytes: 0,
        fontBytes: 0,
        totalRequests: 0,
        thirdPartyRequests: 0,
        imageCount: 0,
        scriptCount: 0,
        styleCount: 0,
        fontCount: 0
    };

    let targetDomain = '';
    try {
        targetDomain = new URL(url).hostname.replace('www.', '');
    } catch (e) {
        targetDomain = url;
    }

    // Capture response streams synchronously to avoid the async promise race traps!
    page.on('response', (response) => {
        metrics.totalRequests++;

        // NATIVE SYNC HEADER CAPTURE (This matches your original working code style, no 'await')
        const headers = response.headers();
        const size = parseInt(headers['content-length'], 10) || 0;
        
        metrics.totalBytes += size;

        // Trace Third Party Domain Vector
        try {
            const requestUrl = new URL(response.url());
            if (!requestUrl.hostname.includes(targetDomain)) {
                metrics.thirdPartyRequests++;
            }
        } catch (err) {}

        // Categorize asset groups based on content-type headers
        const contentType = (headers['content-type'] || '').toLowerCase();

        if (contentType.includes('image')) {
            metrics.imageCount++;
            metrics.imageBytes += size;
        } else if (contentType.includes('javascript') || contentType.includes('ecmascript')) {
            metrics.scriptCount++;
            metrics.scriptBytes += size;
        } else if (contentType.includes('css')) {
            metrics.styleCount++;
            metrics.styleBytes += size;
        } else if (contentType.includes('font')) {
            metrics.fontCount++;
            metrics.fontBytes += size;
        }
    });

    try {
        // Use your original working networkidle condition
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    } catch (error) {
        await browser.close();
        throw new Error("Failed to load URL");
    }

    await browser.close();
    return metrics; // Return the full object structure cleanly
};

module.exports = { analyzeUrl };