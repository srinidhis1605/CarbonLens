const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const analysisRoutes = require('./routes/analysis');
const { router: recommendationsRouter } = require('./routes/recommendations');
const { ensureHistoryColumns } = require('./services/dbService');

dotenv.config({ path: path.join(__dirname, '.env'), override: true });

const app = express();

const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const PORT = Number(process.env.PORT);

if (FRONTEND_ORIGINS.length === 0) {
    throw new Error('Missing FRONTEND_ORIGIN in backend/.env');
}
if (!PORT) {
    throw new Error('Missing PORT in backend/.env');
}

app.use(cors({
    origin: (origin, callback) => {
        // Allow non-browser tools (no Origin header) and configured frontend origins.
        if (!origin || FRONTEND_ORIGINS.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(cookieParser());

// Set up the Database Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// Test the connection
db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL: ' + err.message);
        return;
    }
    console.log('Successfully connected to MySQL Database!');
});

app.use((req, res, next) => {
    req.db = db;
    next();
});

const authRoutes = require('./routes/auth')(db);
app.use('/auth', authRoutes);
app.use('/analysis', analysisRoutes);
app.use('/recommendations', recommendationsRouter);

app.get('/', (req, res) => {
    res.send('CarbonLens Backend is working!');
});

ensureHistoryColumns()
    .then(() => console.log('Analysis history columns ready.'))
    .catch((error) => {
        console.error('Failed to ensure history columns:', error.message);
    });

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});