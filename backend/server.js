// Import the "ingredients" we installed
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const analysisRoutes = require('./routes/analysis');



// Read .env file manually
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.trim().split('=');
        if (key && value) {
            process.env[key] = value;
        }
    });
}


// Also try dotenv as backup
require('dotenv').config({ path: envPath });

const app = express();

// Middleware: These functions run before your routes to handle data 
app.use(cors({ // Allow frontend to talk to backend
    origin: 'http://localhost:5173', // Update this to your React port
    credentials: true // Crucial for cookies to work
}));

app.use(express.json()); // Allow the server to read JSON data
app.use(cookieParser());
app.use('/analysis', analysisRoutes);

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

// Make db available to routes
app.use((req, res, next) => {
    req.db = db;
    next();
});

// Import the auth routes
const authRoutes = require('./routes/auth')(db); 
app.use('/auth', authRoutes);

// Simple test route
app.get('/', (req, res) => {
    res.send('CarbonLens Backend is working!');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});