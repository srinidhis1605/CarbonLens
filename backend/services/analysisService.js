const { chromium } = require('playwright');

const analyzeUrl = async (url) => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    let totalBytes = 0;

    // This "listener" runs every time a resource (image, script, etc) is loaded
    page.on('response', async (response) => {
        const headers = await response.headers();
        const size = parseInt(headers['content-length']) || 0;
        totalBytes += size;
    });

    try {
        await page.goto(url, { waitUntil: 'networkidle' });
    } catch (error) {
        await browser.close();
        throw new Error("Failed to load URL");
    }

    await browser.close();
    return totalBytes;
};

module.exports = { analyzeUrl };