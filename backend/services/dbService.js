// backend/services/dbService.js
const dbPool = require('../db');

/**
 * Saves a complete 16-column carbon analysis record inside an isolated database transaction ledger.
 */
async function saveAnalysisResult(userId, url, metrics) {
    try {
        console.log('\n[DB-SAVE-START] Initializing database save operation');
        console.log('   [DB] Acquiring connection from pool...');
        const connection = await dbPool.getConnection();
        console.log('   [DB] ✅ Connection acquired');

        try {
            console.log('   [DB] Beginning transaction...');
            await connection.beginTransaction();
            console.log('   [DB] ✅ Transaction started');

            console.log('   [DB] Inserting/checking URL in websites table:', url);
            await connection.execute('INSERT IGNORE INTO websites (url) VALUES (?)', [url]);
            console.log('   [DB] ✅ URL processed');

            console.log('   [DB] Fetching website ID...');
            const [rows] = await connection.execute('SELECT id FROM websites WHERE url = ?', [url]);
            console.log('   [DB] Query returned:', rows?.length, 'rows');

            if (!rows || !rows.length) {
                throw new Error('Failed to resolve website ID after insert/select.');
            }

            const websiteId = rows[0].id;
            console.log(`   [DB] ✅ Website ID resolved: ${websiteId}`);

            const raw = metrics.rawScrapedData || {};

            console.log('   [DB] Preparing analysis insert statement...');
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
                metrics.pageWeightMB ?? 0,
                metrics.carbonScore ?? 0,
                metrics.co2EstimateGrams ?? 0,
                metrics.isGreenHost ? 1 : 0,
                raw.totalRequests ?? 0,
                raw.thirdPartyRequests ?? 0,
                raw.imageCount ?? 0,
                raw.imageBytes ?? 0,
                raw.scriptCount ?? 0,
                raw.scriptBytes ?? 0,
                raw.styleCount ?? 0,
                raw.styleBytes ?? 0,
                raw.fontCount ?? 0,
                raw.fontBytes ?? 0,
                metrics.seoMetadata ? JSON.stringify(metrics.seoMetadata) : null
            ];

            const [analysisResult] = await connection.execute(query, values);
            console.log('   [DB] ✅ Analysis record inserted, ID:', analysisResult.insertId);

            console.log('   [DB] Committing transaction...');
            await connection.commit();
            console.log(`   [DB] ✅ Transaction committed! Analysis ID: ${analysisResult.insertId}`);
            console.log('[DB-SAVE-SUCCESS] Database save completed\n');

            return { success: true, websiteId, insertId: analysisResult.insertId };
        } catch (error) {
            console.log('[DB-SAVE-ERROR] Transaction error detected, rolling back...');
            console.log('   [DB] ❌ Error Type:', error.constructor.name);
            console.log('   [DB] ❌ Error Code:', error.code);
            console.log('   [DB] ❌ SQL State:', error.sqlState);
            console.log('   [DB] ❌ Error Message:', error.message);
            console.error('[DB-SAVE-ERROR] Full error object:', error);
            await connection.rollback();
            throw error;
        } finally {
            console.log('   [DB] Releasing connection back to pool...');
            connection.release();
            console.log('   [DB] ✅ Connection released\n');
        }
    } catch (outerError) {
        console.log('[DB-SAVE-OUTER-ERROR] Outer catch block triggered:');
        console.log('   Type:', outerError.constructor.name);
        console.log('   Message:', outerError.message);
        console.error('[DB-SAVE-OUTER-ERROR] Full error:', outerError);
        throw outerError;
    }
}

/**
 * Patches the seo_metadata JSON column for an existing analysis record.
 * @param {number} analysisId - The auto-increment ID of the row to update.
 * @param {Object} seoMetadata - The structural Phase 2 object payload.
 * @returns {Promise<Object>} MySQL execution query receipt.
 */
async function updateSeoMetadata(analysisId, seoData) {
    try {
        const cleanSeoData = { ...seoData };
        delete cleanSeoData.seoAiOptimizations;

        const [result] = await dbPool.execute(
            `UPDATE analysis SET seo_metadata = ? WHERE id = ?`,
            [JSON.stringify(cleanSeoData), analysisId]
        );

        return result;
    } catch (error) {
        console.error('DB Error in updateSeoMetadata:', error.message);
        throw error;
    }
}

module.exports = { saveAnalysisResult, updateSeoMetadata };