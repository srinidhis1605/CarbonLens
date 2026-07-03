// backend/routes/recommendations.js
const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const authenticateToken = require('../middleware/authMiddleware');

// Initializes the connection client redirected to Google's free endpoint
const openai = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL
});

router.post('/', authenticateToken, async (req, res) => {
    const { metrics } = req.body;

    if (!metrics) {
        return res.status(400).json({ error: "Missing website metrics data block." });
    }

    try {
        const promptText = `
            Analyze these web performance metrics and return exactly 3 highly actionable code optimization tips to reduce carbon footprint.
            
            Metrics:
            - Page Size: ${metrics.pageWeightMB.toFixed(2)} MB
            - Sustainability Score: ${metrics.carbonScore}/100
            - CO2 Emissions: ${metrics.co2EstimateGrams} grams per visit
            - Total Requests: ${metrics.rawScrapedData.totalRequests}
            - Images: ${metrics.rawScrapedData.imageCount} (${(metrics.rawScrapedData.imageBytes / (1024*1024)).toFixed(2)} MB)
            - JavaScript: ${metrics.rawScrapedData.scriptCount} (${(metrics.rawScrapedData.scriptBytes / (1024*1024)).toFixed(2)} MB)
            - Stylesheets: ${metrics.rawScrapedData.styleCount} (${(metrics.rawScrapedData.styleBytes / (1024*1024)).toFixed(2)} MB)
            
            Your response must be a strict JSON array containing exactly 3 objects. Do not include markdown wraps or backticks like \`\`\`json in your string output.
            Each object format must strictly mirror this JSON schema structure:
            {
                "impact": "HIGH" | "MEDIUM" | "LOW",
                "category": "Images" | "Scripts" | "Hosting" | "Caching",
                "title": "Short descriptive title",
                "description": "Clear explanation detailing exactly what text or configuration code to change to reduce emissions."
            }
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

        // Strip any potential markdown wrappers the model might add and parse into an object
        let adviceJson;
        try {
            const rawContent = response.choices[0].message.content.trim();
            const cleanText = rawContent.replace(/^```json\s*|```$/g, '');
            adviceJson = JSON.parse(cleanText);
        } catch (parseError) {
            console.error("AI Text Parsing anomaly:", response.choices[0].message.content);
            throw new Error("AI returned data in an invalid structural shape.");
        }

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

module.exports = router;