-- =============================================================================
-- CarbonLens - Aiven MySQL setup (use database: defaultdb)
-- =============================================================================
-- In Aiven console: open your MySQL service -> Query editor, paste and run this.
-- Do NOT run CREATE DATABASE on Aiven free tier.
-- =============================================================================

USE defaultdb;

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

-- -----------------------------------------------------------------------------
-- 2. WEBSITES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS websites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    url VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 3. ANALYSIS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analysis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    website_id INT NOT NULL,
    user_id INT NOT NULL,
    page_size FLOAT DEFAULT 0,
    carbon_score INT DEFAULT 0,
    co2 FLOAT DEFAULT 0,
    is_green_host TINYINT(1) DEFAULT 0,
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
    seo_metadata JSON DEFAULT NULL,
    analysis_payload JSON DEFAULT NULL,
    seo_audit_payload JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_analysis_website
        FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
    CONSTRAINT fk_analysis_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_websites_url ON websites (url);
CREATE INDEX idx_analysis_user_id ON analysis (user_id);
CREATE INDEX idx_analysis_website_id ON analysis (website_id);
CREATE INDEX idx_analysis_created_at ON analysis (created_at);
CREATE INDEX idx_analysis_user_id_id ON analysis (user_id, id);
