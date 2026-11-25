const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const analysisRoutes = require('./routes/analysis');
const { router: recommendationsRouter } = require('./routes/recommendations');
const { ensureHistoryColumns } = require('./services/dbService');
const { ensureV2Tables } = require('./services/v2DbService');
const v2AgentRoutes = require('./routes/v2Agent');
const v2SimulationsRoutes = require('./routes/v2Simulations');
const v2OptimizationRoutes = require('./routes/v2Optimization');
const v2ValidationRoutes = require('./routes/v2Validation');
const v2MlRoutes = require('./routes/v2Ml');
const { ORIGINAL_DIR, OPTIMIZED_DIR } = require('./services/optimizationService');

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

// CarbonLens 2.0 API Routes (v1 routes above remain 100% intact)
app.use('/api/v2/agent', v2AgentRoutes);
app.use('/api/v2/simulations', v2SimulationsRoutes);
app.use('/api/v2/optimization', v2OptimizationRoutes);
app.use('/api/v2/validation', v2ValidationRoutes);
app.use('/api/v2/ml', v2MlRoutes);

// Controlled Test Website static hosting for Module 3 & Module 4 (no-cache so Playwright measures actual transfer)
const controlledStaticOpts = {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store');
    },
};
app.use('/controlled-site/original', express.static(ORIGINAL_DIR, controlledStaticOpts));
app.use('/controlled-site/optimized', express.static(OPTIMIZED_DIR, controlledStaticOpts));

app.get('/', (req, res) => {
    res.send('CarbonLens 2.0 Backend is working!');
});

ensureHistoryColumns()
    .then(() => {
        console.log('Analysis history columns ready.');
        return ensureV2Tables();
    })
    .then(() => console.log('CarbonLens 2.0 database tables ready.'))
    .catch((error) => {
        console.error('Failed to ensure database tables/columns:', error.message);
    });

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});