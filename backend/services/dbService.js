// backend/services/dbService.js
const dbPool = require('../db'); 

async function saveAnalysisResult(userId, url, metrics) {
    const connection = await dbPool.getConnection();
    
    try {
        await connection.beginTransaction();

        // Step 1: Ensure the URL exists in the 'websites' table
        await connection.execute('INSERT IGNORE INTO websites (url) VALUES (?)', [url]);
        
        // Step 2: Grab the website ID
        const [rows] = await connection.execute('SELECT id FROM websites WHERE url = ?', [url]);
        const websiteId = rows[0].id;

        // Step 3: Insert into 'analysis' mapping ALL 15 custom data points
        const query = `
            INSERT INTO analysis (
                website_id, user_id, page_size, carbon_score, co2,
                total_requests, third_party_requests,
                image_count, image_bytes,
                script_count, script_bytes,
                style_count, style_bytes,
                font_count, font_bytes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            websiteId,
            userId,
            metrics.pageWeightMB,
            metrics.carbonScore,
            metrics.co2EstimateGrams,
            metrics.rawScrapedData.totalRequests,
            metrics.rawScrapedData.thirdPartyRequests,
            metrics.rawScrapedData.imageCount,
            metrics.rawScrapedData.imageBytes,
            metrics.rawScrapedData.scriptCount,
            metrics.rawScrapedData.scriptBytes,
            metrics.rawScrapedData.styleCount,
            metrics.rawScrapedData.styleBytes,
            metrics.rawScrapedData.fontCount,
            metrics.rawScrapedData.fontBytes
        ];

        await connection.execute(query, values);

        await connection.commit();
        return { success: true, websiteId };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { saveAnalysisResult };