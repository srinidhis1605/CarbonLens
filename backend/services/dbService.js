// backend/services/dbService.js
const dbPool = require('../db');

/**
 * Saves a complete 16-column carbon analysis record inside an isolated database transaction ledger.
 */
async function saveAnalysisResult(userId, url, metrics) {
    const connection = await dbPool.getConnection();

    try {
        await connection.beginTransaction();

        // Step 1: Ensure the URL exists in the 'websites' table without creating duplicates
        await connection.execute('INSERT IGNORE INTO websites (url) VALUES (?)', [url]);
        
        // Step 2: Grab the website ID matching the targeted domain vector
        const [rows] = await connection.execute('SELECT id FROM websites WHERE url = ?', [url]);

        if (!rows || !rows.length) {
            throw new Error('Failed to resolve website ID after insert/select.');
        }

        const websiteId = rows[0].id;

        // Step 3: Insert into 'analysis' mapping ALL metrics + seo_metadata
        const query = `
            INSERT INTO analysis (
                website_id, user_id, page_size, carbon_score, co2, is_green_host,
                total_requests, third_party_requests,
                image_count, image_bytes,
                script_count, script_bytes,
                style_count, style_bytes,
                font_count, font_bytes,
                seo_metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            websiteId,
            userId,
            metrics.pageWeightMB,
            metrics.carbonScore,
            metrics.co2EstimateGrams,
            metrics.isGreenHost ? 1 : 0, // Translates true -> 1, false -> 0 for TINYINT
            metrics.rawScrapedData.totalRequests,
            metrics.rawScrapedData.thirdPartyRequests,
            metrics.rawScrapedData.imageCount,
            metrics.rawScrapedData.imageBytes,
            metrics.rawScrapedData.scriptCount,
            metrics.rawScrapedData.scriptBytes,
            metrics.rawScrapedData.styleCount,
            metrics.rawScrapedData.styleBytes,
            metrics.rawScrapedData.fontCount,
            metrics.rawScrapedData.fontBytes,
            metrics.seoMetadata ? JSON.stringify(metrics.seoMetadata) : null
        ];

        const [analysisResult] = await connection.execute(query, values);

        // Commit the transaction to disk
        await connection.commit();
        return { success: true, websiteId, insertId: analysisResult.insertId };
    } catch (error) {
        // Rollback changes if any single SQL query throws an exception
        await connection.rollback();
        throw error;
    } finally {
        // Always release the connection pool back to the database system to prevent connection hangs
        connection.release();
    }
}

/**
 * Patches the seo_metadata JSON column for an existing analysis record.
 * @param {number} analysisId - The auto-increment ID of the row to update.
 * @param {Object} seoMetadata - The structural Phase 2 object payload.
 * @returns {Promise<Object>} MySQL execution query receipt.
 */
async function updateSeoMetadata(analysisId, seoMetadata) {
    const connection = await dbPool.getConnection();

    try {
        const query = `UPDATE analysis SET seo_metadata = ? WHERE id = ?`;
        const [result] = await connection.execute(query, [JSON.stringify(seoMetadata), analysisId]);
        return result;
    } finally {
        connection.release();
    }
}

module.exports = { saveAnalysisResult, updateSeoMetadata };