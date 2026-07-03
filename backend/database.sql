-- Database Blueprint for CarbonLens
CREATE DATABASE IF NOT EXISTS carbonlens_db;
USE carbonlens_db;

-- 1. USERS SECURITY LEDGER
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);

-- 2. TARGET WEBSITES INDEX
CREATE TABLE IF NOT EXISTS websites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    url VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. CARBON DECONSTRUCTION ANALYTICS MATRIX
CREATE TABLE IF NOT EXISTS analysis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    website_id INT,
    user_id INT,
    page_size FLOAT,
    carbon_score INT,
    co2 FLOAT,
    is_green_host TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Upgraded Option 2 Micro-Metric Analytics Tracking Columns
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

    is_green_host TINYINT(1) DEFAULT 0,
    
    -- Both Essential Relational Foreign Keys Preserved
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE `analysis` 
ADD COLUMN `seo_metadata` JSON DEFAULT NULL AFTER `font_bytes`;