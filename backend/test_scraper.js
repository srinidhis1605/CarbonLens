// test-scraper.js
const { analyzeUrl } = require('./services/analysisService');

async function runTest() {
    // We will test against a major live site to see real data
    const targetUrl = 'https://example.com'; 
    
    console.log(`Starting scan on: ${targetUrl}...`);
    try {
        const results = await analyzeUrl(targetUrl);
        
        // Print the results cleanly in the terminal terminal
        console.log("\n================ SCAN RESULTS ================");
        console.log(JSON.stringify(results, null, 4));
        console.log("==============================================\n");
        
    } catch (error) {
        console.error("Test failed with error:", error);
    }
}

runTest();