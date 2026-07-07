-- =============================================================================
-- CarbonLens - Complete MySQL Database Setup
-- =============================================================================
-- Run this file to create the full schema and optional sample seed data.
--
-- Local:
--   mysql -u root -p < database.sql
--
-- MySQL Workbench:
--   Open this file and execute all statements.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS carbonlens_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE carbonlens_db;

-- -----------------------------------------------------------------------------
-- Reset (optional) — uncomment only for a clean reinstall
-- -----------------------------------------------------------------------------
-- SET FOREIGN_KEY_CHECKS = 0;
-- DROP TABLE IF EXISTS analysis;
-- DROP TABLE IF EXISTS websites;
-- DROP TABLE IF EXISTS users;
-- SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- 1. USERS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users (email);

-- -----------------------------------------------------------------------------
-- 2. WEBSITES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS websites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    url VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_websites_url ON websites (url);

-- -----------------------------------------------------------------------------
-- 3. ANALYSIS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analysis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    website_id INT NOT NULL,
    user_id INT NOT NULL,

    -- Core environmental metrics
    page_size FLOAT DEFAULT 0,
    carbon_score INT DEFAULT 0,
    co2 FLOAT DEFAULT 0,
    is_green_host TINYINT(1) DEFAULT 0,

    -- Network / asset breakdown
    total_requests INT DEFAULT 0,
    third_party_requests INT DEFAULT 0,
    image_count INT DEFAULT 0,
    image_bytes BIGINT DEFAULT 0,
    script_count INT DEFAULT 0,
    script_bytes BIGINT DEFAULT 0,
    style_count INT DEFAULT 0,
    style_bytes BIGINT DEFAULT 0,
    font_count INT DEFAULT 0,
    font_bytes BIGINT DEFAULT 0,

    -- JSON payloads for history restore
    seo_metadata JSON DEFAULT NULL,
    analysis_payload JSON DEFAULT NULL,
    seo_audit_payload JSON DEFAULT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_analysis_website
        FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
    CONSTRAINT fk_analysis_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_analysis_user_id ON analysis (user_id);
CREATE INDEX idx_analysis_website_id ON analysis (website_id);
CREATE INDEX idx_analysis_created_at ON analysis (created_at);

-- -----------------------------------------------------------------------------
-- Upgrade helpers for older databases (safe to re-run)
-- -----------------------------------------------------------------------------
-- Users: refresh token column
SET @sql_users_refresh = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'users'
              AND COLUMN_NAME = 'refresh_token_hash'
        ),
        'SELECT 1',
        'ALTER TABLE users ADD COLUMN refresh_token_hash VARCHAR(255) DEFAULT NULL AFTER password_hash'
    )
);
PREPARE stmt_users_refresh FROM @sql_users_refresh;
EXECUTE stmt_users_refresh;
DEALLOCATE PREPARE stmt_users_refresh;

-- Analysis: seo_metadata
SET @sql_analysis_seo = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'analysis'
              AND COLUMN_NAME = 'seo_metadata'
        ),
        'SELECT 1',
        'ALTER TABLE analysis ADD COLUMN seo_metadata JSON DEFAULT NULL AFTER font_bytes'
    )
);
PREPARE stmt_analysis_seo FROM @sql_analysis_seo;
EXECUTE stmt_analysis_seo;
DEALLOCATE PREPARE stmt_analysis_seo;

-- Analysis: analysis_payload
SET @sql_analysis_payload = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'analysis'
              AND COLUMN_NAME = 'analysis_payload'
        ),
        'SELECT 1',
        'ALTER TABLE analysis ADD COLUMN analysis_payload JSON DEFAULT NULL AFTER seo_metadata'
    )
);
PREPARE stmt_analysis_payload FROM @sql_analysis_payload;
EXECUTE stmt_analysis_payload;
DEALLOCATE PREPARE stmt_analysis_payload;

-- Analysis: seo_audit_payload
SET @sql_analysis_seo_payload = (
    SELECT IF(
        EXISTS(
            SELECT 1
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'analysis'
              AND COLUMN_NAME = 'seo_audit_payload'
        ),
        'SELECT 1',
        'ALTER TABLE analysis ADD COLUMN seo_audit_payload JSON DEFAULT NULL AFTER analysis_payload'
    )
);
PREPARE stmt_analysis_seo_payload FROM @sql_analysis_seo_payload;
EXECUTE stmt_analysis_seo_payload;
DEALLOCATE PREPARE stmt_analysis_seo_payload;

-- -----------------------------------------------------------------------------
-- Sample seed data (optional)
-- Demo login: demo@carbonlens.com / password123
-- -----------------------------------------------------------------------------
INSERT INTO users (name, email, password_hash)
VALUES (
    'Demo User',
    'demo@carbonlens.com',
    '$2b$10$fqMFdT67w32X/SpCWnuC1.9.1EZsWrW8HK6J91gUMUv80EBocLcMC'
)
ON DUPLICATE KEY UPDATE
    name = VALUES(name);

INSERT INTO websites (url)
VALUES ('https://example.com')
ON DUPLICATE KEY UPDATE url = VALUES(url);

INSERT INTO analysis (
    website_id,
    user_id,
    page_size,
    carbon_score,
    co2,
    is_green_host,
    total_requests,
    third_party_requests,
    image_count,
    image_bytes,
    script_count,
    script_bytes,
    style_count,
    style_bytes,
    font_count,
    font_bytes,
    seo_metadata,
    analysis_payload,
    seo_audit_payload
)
SELECT
    w.id,
    u.id,
    1.25,
    72,
    0.45,
    0,
    42,
    18,
    12,
    734003,
    8,
    125829,
    4,
    65536,
    2,
    32768,
    NULL,
    JSON_OBJECT(
        'SESSION_STATUS', 'PERFORMANCE_ANALYSIS_COMPLETED',
        'TARGET_HOST', 'example.com',
        'DATABASE_RECORD_ID', 1,
        'PHASE_2_ENVIRONMENTAL_RECONSTRUCTION', JSON_OBJECT(
            'TOTAL_TRANSMITTED_WEIGHT', '1.25 MB',
            'RECONSTRUCTED_METRICS', JSON_OBJECT(
                'CARBON_EFFICIENCY_SCORE', '72/100',
                'SUSTAINABILITY_GRADE', 'C'
            )
        )
    ),
    NULL
FROM websites w
JOIN users u ON u.email = 'demo@carbonlens.com'
WHERE w.url = 'https://example.com'
  AND NOT EXISTS (
      SELECT 1
      FROM analysis a
      WHERE a.website_id = w.id
        AND a.user_id = u.id
  );

-- -----------------------------------------------------------------------------
-- Useful queries
-- -----------------------------------------------------------------------------

-- List all users
-- SELECT id, name, email, created_at FROM users;

-- List recent analyses for a user
-- SELECT a.id, w.url, a.carbon_score, a.created_at
-- FROM analysis a
-- JOIN websites w ON w.id = a.website_id
-- JOIN users u ON u.id = a.user_id
-- WHERE u.email = 'demo@carbonlens.com'
-- ORDER BY a.created_at DESC;

-- Delete one analysis record
-- DELETE FROM analysis WHERE id = 1;

-- Delete a user and all related analyses
-- DELETE FROM users WHERE email = 'demo@carbonlens.com';
