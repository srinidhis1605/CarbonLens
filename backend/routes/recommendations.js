// backend/routes/recommendations.js
const express = require('express');
const { Router } = require('express');
const router = Router();
const { OpenAI } = require('openai');
const authenticateToken = require('../middleware/authMiddleware');

// Initializes the connection client redirected to Google's free endpoint
const openai = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL
});

// --- HELPER FUNCTION WITH UPDATED PROMPT RULES ---
async function fetchAiAdvice(metrics) {
    const promptText = `
    Analyze these scraped parameters and generate a JSON array of optimizations.
    
    Page Weight: ${((metrics.networkMetrics?.totalBytes || 0) / (1024*1024)).toFixed(2)} MB
    Total Requests: ${metrics.networkMetrics?.totalRequests || 0}
    
    SEO Check Profile:
    - Title Present: ${metrics.seoMetrics?.visualAuditChecklist?.hasTitle || false} (Length: ${metrics.seoMetrics?.titleLength || 0} chars)
    - Meta Description Present: ${metrics.seoMetrics?.visualAuditChecklist?.hasMetaDescription || false}
    - Mobile Optimized: ${metrics.seoMetrics?.visualAuditChecklist?.isMobileOptimized || false}
    
    Provide code optimizations if any criteria flags false.

    STRICT DATA OUTPUT CONSTRAINTS:
    1. Your response must be a strict JSON array containing EXACTLY 3 objects.
    2. Do not include markdown wraps or backticks like \`\`\`json in your string output.
    3. You must provide exactly ONE card for each impact level: The first must be "HIGH", the second "MEDIUM", the third "LOW".
    4. MANDATORY CATEGORY DIVERSITY: Each object MUST have a unique category. You cannot repeat categories. 
       - Object 1 (HIGH impact) -> Select the worst performing metric category (e.g., if Images or Scripts are huge).
       - Object 2 (MEDIUM impact) -> Pick a completely different category (e.g., Caching strategies or asset minification).
       - Object 3 (LOW impact) -> Pick a third, different category (e.g., Hosting green checks or clean code maintenance).
    5. If a metric count/weight is 0, do not recommend optimizations for that category; talk about advanced strategies in the other allowed categories (Scripts, Caching, Hosting).

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

    // Using gemini-2.5-flash which is completely free on Google AI Studio
    const response = await openai.chat.completions.create({
        model: "gemini-2.5-flash", 
        messages: [
            { role: "system", content: "You are a green web engineering specialist. You respond exclusively with raw, valid JSON arrays." },
            { role: "user", content: promptText }
        ],
        temperature: 0.2
    });

    const rawContent = response.choices[0].message.content.trim();
    const cleanText = rawContent.replace(/^```json\s*|```$/g, '');
    return JSON.parse(cleanText);
}

// Your route remains perfectly protected by authenticateToken and uses the helper function
router.post('/', authenticateToken, async (req, res) => {
    const { metrics } = req.body;

    if (!metrics) {
        return res.status(400).json({ error: "Missing website metrics data block." });
    }

    try {
        // Calls our internal text/token handler
        const adviceJson = await fetchAiAdvice(metrics);

        res.json({
            RECOMMENDATION_ENGINE_STATUS: "OPTIMIZATIONS_GENERATED",
            PROVIDER: "Google_AI_Studio_Free_Tier",
            TIMESTAMP: Date.now(),
            ADVICE_PAYLOAD: adviceJson
        });

    } catch (error) {
        console.error("AI Recommendation Route Failure:", error);
        res.status(500).json({ error: "AI_AGENT_PROCESSING_FAILURE", details: error.message });
    }
});

// --- EXPORT BOTH SO OTHER FILES CAN USE IT ---
module.exports = {
    router: router,          
    fetchAiAdvice: fetchAiAdvice  
};