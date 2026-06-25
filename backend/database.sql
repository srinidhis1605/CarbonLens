-- Database Blueprint for CarbonLens
CREATE DATABASE IF NOT EXISTS carbonlens_db;
USE carbonlens_db;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);

