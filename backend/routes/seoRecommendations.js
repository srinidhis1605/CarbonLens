// backend/routes/seoRecommendations.js
const express = require('express');
const { Router } = require('express');
const router = Router();
const { OpenAI } = require('openai');
const authenticateToken = require('../middleware/authMiddleware');

// Initialize OpenAI client targeting Google AI Studio's highly efficient Gemini Endpoint
const openai = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

/**
 * HYBRID ENGINE: Combines lightning-fast local deterministic code rules 
 * with a high-efficiency targeted Gemini token request via OpenAI wrapper.
 */
async function fetchSeoAiAdvice(seoMetrics) {
    const finalRecommendations = [];

    // Extract raw metrics with safe fallbacks
    const semantics = seoMetrics?.semantics || {};
    const crawler = seoMetrics?.crawlerConfigurations || {};
    const legal = seoMetrics?.legalCompliance || {};
    const keywordsArray = seoMetrics?.keywords || [];
    const metaDescription = seoMetrics?.metaDescription || '';
    const titleText = seoMetrics?.title || '';

    // =========================================================================
    // LAYER A: LOCAL DETERMINISTIC RULES (100% Reliable, Zero Quota Cost, Zero 429 Risks)
    // =========================================================================
    
    // 1. Crawler Core
    if (crawler.robotsTxt?.found === true && crawler.robotsTxt?.globalIndexingBlocked === true) {
        finalRecommendations.push({
            impact: "CRITICAL", 
            category: "Indexation",
            title: "Emergency: Global Indexing Blocked in robots.txt",
            description: "Your robots.txt file contains a 'Disallow: /' directive. This instructs public bots to ignore your entire domain infrastructure, making you invisible in organic searches."
        });
    }
    if (crawler.sitemapXml?.found === false) {
        finalRecommendations.push({
            impact: "HIGH", 
            category: "Indexation",
            title: "Missing Dynamic XML Sitemap Root",
            description: "No map file was verified at standard path origins. Search engine crawlers have to guess your deep dropdown architectures, slowing down indexation."
        });
    }

    // 2. Headings & Layout Semantics
    if (semantics.headings?.status === 'MISSING_H1') {
        finalRecommendations.push({
            impact: "HIGH", 
            category: "Semantics",
            title: "Missing Primary H1 Heading Asset",
            description: "Your primary layout view lacks an explicit <h1> wrapper tag. Search engines treat the H1 as the absolute core summary theme of the document page."
        });
    } else if (semantics.headings?.status === 'MULTIPLE_H1') {
        finalRecommendations.push({
            impact: "MEDIUM", 
            category: "Semantics",
            title: "Consolidate Multiple H1 Elements",
            description: `Discovered ${semantics.headings.h1Count} separate H1 tags on the homepage template. Convert secondary elements to H2 or H3 blocks to stop diluting your target keyword focus.`
        });
    }

    if (semantics.images?.missingAltCount > 0) {
        finalRecommendations.push({
            impact: "MEDIUM", 
            category: "Accessibility",
            title: "Repair Missing Image Alt Attributes",
            description: `Found ${semantics.images.missingAltCount} images lacking 'alt="..."' text attributes. This lowers your visual search discovery rankings in Google Images and impacts accessibility.`
        });
    }

    // 3. Legal Risk Profiles
    if (legal.privacyPolicy?.present === false) {
        finalRecommendations.push({
            impact: "HIGH", 
            category: "Legal & Trust",
            title: "Deploy Mandatory Privacy Policy Page",
            description: "No privacy policy path was found during the site sweep. Adding one satisfies data handling regulations like GDPR and feeds crucial algorithmic trust signals."
        });
    }
    if (legal.termsAndConditions?.present === false) {
        finalRecommendations.push({
            impact: "MEDIUM", 
            category: "Legal & Trust",
            title: "Publish Site Terms and Conditions Documentation",
            description: "Missing user agreement documentation across available sub-pages. Deploy a clean terms page to legally safeguard your channel operations and build brand authority."
        });
    }

    // =========================================================================
    // LAYER B: LIGHTWEIGHT, TARGETED DYNAMIC KEYWORD API CALL (Using gemini-2.5-flash)
    // =========================================================================
    if (!process.env.AI_API_KEY) {
        console.warn("[AI Engine] Missing GEMINI_API_KEY environment variable. Skipping Layer B.");
        return finalRecommendations;
    }

    try {
        const compactTargetPrompt = `
        You are an expert SEO Content Strategist. Analyze these brief metrics:
        - Title: "${titleText}"
        - Description: "${metaDescription}"
        - Discovered Site Keywords: [${keywordsArray.join(', ')}]

        Provide an optimization recommendation for this content structure. What specific topics or long-tail keyword types should be injected across their dropdown panels to help them discover high-intent transactional search traffic?

        STRICT DATA OUTPUT CONSTRAINTS:
        1. You MUST respond with a single, raw valid JSON object. 
        2. Do not include markdown wraps or backticks like \`\`\`json in your string output.

        JSON Structure Schema:
        {
          "impact": "HIGH" | "MEDIUM" | "LOW",
          "category": "Keywords",
          "title": "A short, sharp keyword strategy title",
          "description": "Your detailed strategic advice paragraph here."
        }
        `;

        const response = await openai.chat.completions.create({
            model: "gemini-2.5-flash", 
            messages: [
                { role: "system", content: "You are an elite Enterprise SEO Content Consultant. You respond exclusively with raw, valid JSON objects without markdown." },
                { role: "user", content: compactTargetPrompt }
            ],
            temperature: 0.3
        });

        const rawContent = response.choices[0].message.content.trim();
        const cleanText = rawContent.replace(/^```json\s*|```$/g, '');
        const parsedKeywordAdvice = JSON.parse(cleanText);
        
        if (parsedKeywordAdvice && parsedKeywordAdvice.title) {
            finalRecommendations.push(parsedKeywordAdvice);
        }

    } catch (aiError) {
        console.error("Layer B Gemini call bypassed or throttled:", aiError.message);
        
        // Balanced structural fallback if the free tier pipeline encounters a hiccup
        finalRecommendations.push({
            impact: "MEDIUM",
            category: "Keywords",
            title: "Expand Long-Tail Keyword Footprint across Dropdowns",
            description: `Currently indexing a narrow group of keywords: [${keywordsArray.join(', ')}]. Map out your dropdown landing paths to target high-intent transactional search queries matching your industry context.`
        });
    }

    return finalRecommendations;
}

// Router post endpoint consumes the exact hybrid generator function cleanly
router.post('/', authenticateToken, async (req, res) => {
    const { seoMetrics } = req.body;
    if (!seoMetrics) {
        return res.status(400).json({ error: "Missing crawler seoMetrics data block." });
    }

    try {
        const adviceJson = await fetchSeoAiAdvice(seoMetrics);

        res.json({
            RECOMMENDATION_ENGINE_STATUS: "SEO_OPTIMIZATIONS_GENERATED",
            PROVIDER: "Google_AI_Studio_Gemini_Flash_Hybrid",
            TIMESTAMP: Date.now(),
            ADVICE_PAYLOAD: adviceJson
        });

    } catch (error) {
        console.error("SEO AI Recommendation Route Failure:", error);
        res.status(500).json({ error: "SEO_AI_PROCESSING_FAILURE", details: error.message });
    }
});

module.exports = {
    router: router,
    fetchSeoAiAdvice: fetchSeoAiAdvice
};