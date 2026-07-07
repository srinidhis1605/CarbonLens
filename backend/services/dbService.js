// backend/services/dbService.js
const dbPool = require('../db');

function parseJsonColumn(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function toSafeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function calculateGrade(score) {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 65) return 'C';
    if (score >= 50) return 'D';
    if (score >= 35) return 'E';
    return 'F';
}

function extractHost(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return String(url || '').replace(/^www\./, '');
    }
}

function bytesToMb(bytes) {
    return (toSafeNumber(bytes) / (1024 * 1024)).toFixed(2);
}

function buildLegacyAnalysisPayload(row) {
    const pageWeightMB = toSafeNumber(row.page_size);
    const carbonScore = Math.floor(toSafeNumber(row.carbon_score));
    const totalRequests = Math.floor(toSafeNumber(row.total_requests));
    const thirdPartyRequests = Math.floor(toSafeNumber(row.third_party_requests));
    const imageCount = Math.floor(toSafeNumber(row.image_count));
    const scriptCount = Math.floor(toSafeNumber(row.script_count));
    const styleCount = Math.floor(toSafeNumber(row.style_count));
    const fontCount = Math.floor(toSafeNumber(row.font_count));

    return {
        SESSION_STATUS: 'PERFORMANCE_ANALYSIS_COMPLETED',
        TARGET_HOST: extractHost(row.url),
        TIMESTAMP_EPOCH: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        DATABASE_RECORD_ID: row.id,
        PHASE_1_RAW_SOCKET_INTERCEPTION: {
            STATUS: 'DATA_HARVEST_SUCCESSFUL',
            INTERCEPTED_TRAFFIC: {
                TOTAL_NETWORK_REQUESTS_LOGGED: totalRequests,
                FOREIGN_THIRD_PARTY_INJECTIONS: thirdPartyRequests,
            },
            EXTRACTED_PAYLOAD_SIGNATURES: [
                {
                    CLASSIFICATION: 'BINARY_IMAGES',
                    COUNT: imageCount,
                    RAW_WEIGHT: `${bytesToMb(row.image_bytes)} MB`,
                },
                {
                    CLASSIFICATION: 'CLIENT_JS_SCRIPTS',
                    COUNT: scriptCount,
                    RAW_WEIGHT: `${bytesToMb(row.script_bytes)} MB`,
                },
                {
                    CLASSIFICATION: 'COMPRESSED_STYLES',
                    COUNT: styleCount,
                    RAW_WEIGHT: `${bytesToMb(row.style_bytes)} MB`,
                },
                {
                    CLASSIFICATION: 'EMBEDDED_FONTS',
                    COUNT: fontCount,
                    RAW_WEIGHT: `${bytesToMb(row.font_bytes)} MB`,
                },
            ],
        },
        PHASE_2_ENVIRONMENTAL_RECONSTRUCTION: {
            STATUS: 'CALCULATION_MATRIX_ENGAGED',
            TOTAL_TRANSMITTED_WEIGHT: `${pageWeightMB.toFixed(2)} MB`,
            HOSTING_INFRASTRUCTURE: {
                IS_GREEN_PROVIDER: row.is_green_host === 1 || row.is_green_host === true,
                PROVIDER_SOURCE_CREDIT: 'The Green Web Foundation API',
            },
            RECONSTRUCTED_METRICS: {
                CARBON_EFFICIENCY_SCORE: `${carbonScore}/100`,
                SUSTAINABILITY_GRADE: calculateGrade(carbonScore),
            },
        },
        PHASE_3_SPEED_METRICS_TRANSCRIPT: {
            STATUS: 'LEGACY_RECORD',
            METRICS: {},
        },
        AI_SUSTAINABILITY_OPTIMIZATIONS: [],
        SYSTEM_INTEGRITY_NOTICE:
            'Legacy record restored from saved database metrics. Speed metrics and AI suggestions are unavailable. Re-run analysis for the full report.',
    };
}

function buildLegacySeoPayload(row) {
    const seoMetadata = parseJsonColumn(row.seo_metadata);
    if (!seoMetadata) return null;

    return {
        SESSION_STATUS: 'SEO_AUDIT_COMPLETED',
        DATABASE_RECORD_ID: row.id,
        SEO_METRICS_REPORT: seoMetadata,
        AI_STRUCTURAL_OPTIMIZATIONS: [],
    };
}

async function ensureHistoryColumns() {
    const alters = [
        'ALTER TABLE analysis ADD COLUMN analysis_payload JSON DEFAULT NULL',
        'ALTER TABLE analysis ADD COLUMN seo_audit_payload JSON DEFAULT NULL',
    ];

    for (const sql of alters) {
        try {
            await dbPool.execute(sql);
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') {
                throw error;
            }
        }
    }
}

/**
 * Saves a complete carbon analysis record inside an isolated database transaction.
 */
async function saveAnalysisResult(userId, url, metrics) {
    const connection = await dbPool.getConnection();

    try {
        await connection.beginTransaction();

        await connection.execute('INSERT IGNORE INTO websites (url) VALUES (?)', [url]);

        const [rows] = await connection.execute('SELECT id FROM websites WHERE url = ?', [url]);
        if (!rows?.length) {
            throw new Error('Failed to resolve website ID after insert/select.');
        }

        const websiteId = rows[0].id;
        const raw = metrics.rawScrapedData || {};

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
            metrics.seoMetadata ? JSON.stringify(metrics.seoMetadata) : null,
        ];

        const [analysisResult] = await connection.execute(query, values);
        await connection.commit();

        return { success: true, websiteId, insertId: analysisResult.insertId };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function saveAnalysisPayload(analysisId, userId, payload) {
    const [result] = await dbPool.execute(
        `UPDATE analysis
         SET analysis_payload = ?
         WHERE id = ? AND user_id = ?`,
        [JSON.stringify(payload), analysisId, userId]
    );

    if (result.affectedRows === 0) {
        throw new Error('Analysis record not found for this user.');
    }

    return result;
}

async function updateSeoMetadata(analysisId, userId, seoData) {
    const cleanSeoData = { ...seoData };
    delete cleanSeoData.seoAiOptimizations;

    const [result] = await dbPool.execute(
        `UPDATE analysis
         SET seo_metadata = ?
         WHERE id = ? AND user_id = ?`,
        [JSON.stringify(cleanSeoData), analysisId, userId]
    );

    if (result.affectedRows === 0) {
        throw new Error('Analysis record not found for this user.');
    }

    return result;
}

async function saveSeoAuditPayload(analysisId, userId, seoPayload) {
    const [result] = await dbPool.execute(
        `UPDATE analysis
         SET seo_audit_payload = ?
         WHERE id = ? AND user_id = ?`,
        [JSON.stringify(seoPayload), analysisId, userId]
    );

    if (result.affectedRows === 0) {
        throw new Error('Analysis record not found for this user.');
    }

    return result;
}

async function getAnalysisHistory(userId, limit = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

    const [rows] = await dbPool.execute(
        `SELECT
            a.id,
            w.url,
            a.carbon_score,
            a.created_at,
            CASE WHEN a.analysis_payload IS NOT NULL THEN 1 ELSE 0 END AS has_full_payload,
            CASE
                WHEN a.seo_audit_payload IS NOT NULL OR a.seo_metadata IS NOT NULL THEN 1
                ELSE 0
            END AS has_seo
         FROM analysis a
         INNER JOIN websites w ON w.id = a.website_id
         WHERE a.user_id = ?
         ORDER BY a.created_at DESC
         LIMIT ${safeLimit}`,
        [userId]
    );

    return rows.map((row) => ({
        id: row.id,
        url: row.url,
        carbonScore: row.carbon_score,
        createdAt: row.created_at,
        hasSeo: !!row.has_seo,
        isLegacy: !row.has_full_payload,
    }));
}

async function getAnalysisById(userId, analysisId) {
    const [rows] = await dbPool.execute(
        `SELECT
            a.id,
            a.user_id,
            a.page_size,
            a.carbon_score,
            a.co2,
            a.is_green_host,
            a.total_requests,
            a.third_party_requests,
            a.image_count,
            a.image_bytes,
            a.script_count,
            a.script_bytes,
            a.style_count,
            a.style_bytes,
            a.font_count,
            a.font_bytes,
            a.seo_metadata,
            a.created_at,
            a.analysis_payload,
            a.seo_audit_payload,
            w.url
         FROM analysis a
         INNER JOIN websites w ON w.id = a.website_id
         WHERE a.id = ? AND a.user_id = ?
         LIMIT 1`,
        [analysisId, userId]
    );

    if (!rows.length) {
        return null;
    }

    const row = rows[0];
    const savedAnalysis = parseJsonColumn(row.analysis_payload);
    const savedSeo = parseJsonColumn(row.seo_audit_payload);
    const isLegacy = !savedAnalysis;

    return {
        analysisId: row.id,
        url: row.url,
        analysis: savedAnalysis || buildLegacyAnalysisPayload(row),
        seo: savedSeo || buildLegacySeoPayload(row),
        isLegacy,
    };
}

module.exports = {
    ensureHistoryColumns,
    saveAnalysisResult,
    saveAnalysisPayload,
    updateSeoMetadata,
    saveSeoAuditPayload,
    getAnalysisHistory,
    getAnalysisById,
};
