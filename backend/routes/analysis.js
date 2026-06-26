const express = require('express');
const router = express.Router();
const { analyzeUrl } = require('../services/analysisService');
const authenticateToken = require('../middleware/authMiddleware');

router.post('/', authenticateToken, async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
        const bytes = await analyzeUrl(url);
        const mb = (bytes / (1024 * 1024)).toFixed(2);
        
        // Simple carbon calculation (0.5g CO2 per MB)
        const co2 = (mb * 0.5).toFixed(4);

        res.json({ 
            url, 
            pageWeightMB: mb, 
            co2EstimateGrams: co2 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;