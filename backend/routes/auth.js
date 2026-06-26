const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// We use a function that takes 'db' as an argument
module.exports = (db) => {
    router.post('/register', async (req, res) => {
        const { name, email, password } = req.body;
        
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const sql = "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)";
            
            db.query(sql, [name, email, hashedPassword], (err, result) => {
                if (err) return res.status(500).json({ error: "Registration failed." });
                res.status(201).json({ message: "User registered successfully!" });
            });
        } catch (err) {
            res.status(500).json({ error: "Server error." });
        }
    });

    router.post('/login', (req, res) => {
        const { email, password } = req.body;
        const sql = "SELECT * FROM users WHERE email = ?";

        db.query(sql, [email], async (err, results) => {
            if (err) return res.status(500).json({ error: "Server error" });
            if (results.length === 0) return res.status(401).json({ error: "User not found" });

            const user = results[0];
            
            // Compare the plain text password with the stored hash
            const isMatch = await bcrypt.compare(password, user.password_hash);
            
            if (isMatch) {
                const accessToken = jwt.sign(
                    { id: user.id },
                    process.env.JWT_SECRET,
                    { expiresIn: '15m' }
                );

                const refreshToken = jwt.sign(
                    { id: user.id },
                    process.env.JWT_REFRESH_SECRET,
                    { expiresIn: '7d' }
                );

                // Hash the refresh token before storing
                const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

                // Store the hash
                await db.promise().query(
                "UPDATE users SET refresh_token_hash = ? WHERE id = ?",
                [hashedRefreshToken, user.id]
                );

                // Send refresh token as HTTP-only cookie
                res.cookie('accessToken', accessToken, {
                        httpOnly: true,
                        // This automatically switches based on your environment!
                        secure: process.env.NODE_ENV === 'production', 
                        // This allows it to work across subdomains if needed later
                        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
                        maxAge: 15 * 60 * 1000 
                    });

                res.json({ accessToken });
            } else {
                res.status(401).json({ error: "Invalid password" });
            }
        });
    });

    router.post('/refresh', async (req, res) => {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) return res.status(401).json({ error: "No refresh token" });

        // Verify token against DB
        const [users] = await db.promise().query(
    "SELECT * FROM users WHERE id = ?",
    [jwt.decode(refreshToken).id]
);

if (users.length === 0)
    return res.status(403).json({ error: "Invalid refresh token" });

const userRecord = users[0];

const isValid = await bcrypt.compare(
    refreshToken,
    userRecord.refresh_token_hash
);

if (!isValid)
    return res.status(403).json({ error: "Invalid refresh token" });

        jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, user) => {
            if (err) return res.status(403).json({ error: "Token expired" });

            const accessToken = jwt.sign(
                { id: user.id },
                process.env.JWT_SECRET,
                { expiresIn: '15m' }
            );

            res.json({ accessToken });
        });
    });

    return router;
};