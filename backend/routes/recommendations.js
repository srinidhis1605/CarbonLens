// backend/routes/recommendations.js
const express = require('express');
const { Router } = require('express');
const router = Router();
const { OpenAI } = require('openai');
const authenticateToken = require('../middleware/authMiddleware');

// Initialize OpenAI client targeting Google AI Studio's Gemini Endpoint
const openai = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

console.log('[INIT] AI Client configured - API Key:', process.env.AI_API_KEY ? 'SET' : 'MISSING');

async function fetchAiAdvice(metrics) {
    console.log('[AI] fetchAiAdvice() called with metrics:', {
        pageWeightMB: metrics.pageWeightMB,
        carbonScore: metrics.carbonScore,
        totalRequests: metrics.rawScrapedData?.totalRequests
    });

    const promptText = `
    Analyze these web performance metrics and return exactly 3 code optimization tips to reduce carbon footprint.
    Analyze these scraped parameters and generate a JSON array of optimizations.
    
    Metrics:
    - Page Size: ${metrics.pageWeightMB?.toFixed(2) || '0.00'} MB
    - Sustainability Score: ${metrics.carbonScore || '0'}/100
    - CO2 Emissions: ${metrics.co2EstimateGrams || '0'} grams per visit
    - Total Requests: ${metrics.rawScrapedData?.totalRequests || 0}
    - Images: ${metrics.rawScrapedData?.imageCount || 0} (${((metrics.rawScrapedData?.imageBytes || 0) / (1024*1024)).toFixed(2)} MB)
    - JavaScript: ${metrics.rawScrapedData?.scriptCount || 0} (${((metrics.rawScrapedData?.scriptBytes || 0) / (1024*1024)).toFixed(2)} MB)
    - Stylesheets: ${metrics.rawScrapedData?.styleCount || 0} (${((metrics.rawScrapedData?.styleBytes || 0) / (1024*1024)).toFixed(2)} MB)

    STRICT DATA OUTPUT CONSTRAINTS:
    1. Your response must be a strict JSON array containing EXACTLY 3 objects.
    2. Do not include markdown wraps or backticks like \`\`\`json in your string output.
    3. You must provide exactly ONE card for each impact level: The first must be "HIGH", the second "MEDIUM", the third "LOW".
    4. MANDATORY CATEGORY DIVERSITY: Each object MUST have a unique category. You cannot repeat categories. 
       - Object 1 (HIGH impact) -> Select the worst performing metric category (e.g., if Images or Scripts are huge).
       - Object 2 (MEDIUM impact) -> Pick a completely different category (e.g., Caching strategies or asset minification).
       - Object 3 (LOW impact) -> Pick a third, different category (e.g., Hosting green checks or clean code maintenance).

    JSON Structure Schema:
    [
        {
            "impact": "HIGH",
            "category": "Images" | "Scripts" | "Hosting" | "Caching",
            "title": "...",
            "description": "..."
        },
        {
            "impact": "MEDIUM",
            "category": "Images" | "Scripts" | "Hosting" | "Caching",
            "title": "...",
            "description": "..."
        },
        {
            "impact": "LOW",
            "category": "Images" | "Scripts" | "Hosting" | "Caching",
            "title": "...",
            "description": "..."
        }
    ]
`;

    const apiStartTime = Date.now();
    console.log('\n' + '─'.repeat(80));
    console.log('🔄 [AI] Making API call to Gemini with model: gemini-2.5-flash');
    console.log('─'.repeat(80));
    try {
        const response = await openai.chat.completions.create({
            model: "gemini-2.5-flash", 
            messages: [
                { role: "system", content: "You are a green web engineering specialist. You respond exclusively with raw, valid JSON arrays without markdown blocks." },
                { role: "user", content: promptText }
            ],
            temperature: 0.2
        });

        const apiElapsedTime = Date.now() - apiStartTime;
        console.log('✅ [AI] API Response received successfully in ' + apiElapsedTime + 'ms');
        console.log('   - Response choices:', response.choices?.length);
        console.log('   - Content length:', response.choices?.[0]?.message?.content?.length, 'chars');

        const rawContent = response.choices[0].message.content.trim();
        const cleanText = rawContent.replace(/^```json\s*|```$/g, '');
        const parsed = JSON.parse(cleanText);
        
        console.log('📦 [AI] Successfully parsed JSON response with', parsed.length, 'recommendations');
        console.log('─'.repeat(80) + '\n');
        return parsed;
    } catch (error) {
        const apiElapsedTime = Date.now() - apiStartTime;
        console.error('❌ [AI] ERROR in fetchAiAdvice after ' + apiElapsedTime + 'ms:');
        console.error('   - Status Code:', error.status);
        console.error('   - Error Message:', error.message);
        console.error('   - Error Type:', error.constructor.name);
        console.error('─'.repeat(80) + '\n');
        throw error;
    }
}

router.post('/', authenticateToken, async (req, res) => {
    console.log('[ROUTE] POST /recommendations called');
    
    const { metrics } = req.body;
    if (!metrics) {
        console.warn('[ROUTE] Missing metrics data');
        return res.status(400).json({ error: "Missing website metrics data block." });
    }

    try {
        console.log('[ROUTE] Calling fetchAiAdvice...');
        const adviceJson = await fetchAiAdvice(metrics);
        
        console.log('[ROUTE] Successfully generated recommendations, sending response');
        res.json({
            RECOMMENDATION_ENGINE_STATUS: "OPTIMIZATIONS_GENERATED",
            PROVIDER: "Google_AI_Studio_Free_Tier",
            TIMESTAMP: Date.now(),
            ADVICE_PAYLOAD: adviceJson
        });
    } catch (error) {
        console.error("[ROUTE] AI Recommendation Route Failure:", {
            status: error.status,
            message: error.message,
            type: error.constructor.name
        });
        
        res.status(500).json({ 
            error: "AI_AGENT_PROCESSING_FAILURE", 
            details: error.message,
            status: error.status 
        });
    }
});

module.exports = {
    router: router,          
    fetchAiAdvice: fetchAiAdvice  
};