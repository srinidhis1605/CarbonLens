const express = require('express');
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
        console.warn(`CORS blocked for origin: ${origin}. Allowed: ${FRONTEND_ORIGINS.join(', ')}`);
        // Use false (not Error) so preflight OPTIONS does not return 500.
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(cookieParser());

const dbPool = require('./db');

dbPool
    .query('SELECT 1')
    .then(() => console.log('Successfully connected to MySQL Database!'))
    .catch((err) => {
        console.error('Error connecting to MySQL:', err.message);
    });

app.use((req, res, next) => {
    req.db = dbPool;
    next();
});

const authRoutes = require('./routes/auth')(dbPool);
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