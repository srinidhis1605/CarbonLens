// backend/db.js
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '.env') });

function getSslConfig() {
    if (process.env.DB_SSL === 'false') {
        return undefined;
    }

    if (process.env.DB_SSL_CA_PEM) {
        return {
            rejectUnauthorized: true,
            ca: process.env.DB_SSL_CA_PEM.replace(/\\n/g, '\n'),
        };
    }

    const caPath =
        process.env.DB_SSL_CA || path.join(__dirname, 'certs', 'ca.pem');

    if (fs.existsSync(caPath)) {
        return {
            rejectUnauthorized: true,
            ca: fs.readFileSync(caPath, 'utf8'),
        };
    }

    if (process.env.DB_SSL === 'true') {
        throw new Error(
            `Aiven requires SSL. Download the CA certificate from Aiven and save it to ${caPath}, or set DB_SSL_CA_PEM in .env`
        );
    }

    return undefined;
}

const poolConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
};

const ssl = getSslConfig();
if (ssl) {
    poolConfig.ssl = ssl;
}

const pool = mysql.createPool(poolConfig);

module.exports = pool;
