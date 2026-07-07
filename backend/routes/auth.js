const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

function getCookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: isProduction,
        // Netlify frontend + Render backend are different sites; cookies need SameSite=None.
        sameSite: isProduction ? 'none' : 'lax',
    };
}

module.exports = (db) => {
    const router = express.Router();

    router.post('/register', async (req, res) => {
        const { name, email, password } = req.body;

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            await db.query(
                'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
                [name, email, hashedPassword]
            );
            res.status(201).json({ message: 'User registered successfully!' });
        } catch (err) {
            console.error('Registration failed:', err.message);
            res.status(500).json({ error: 'Registration failed.' });
        }
    });

    router.post('/login', async (req, res) => {
        const { email, password } = req.body;

        try {
            const [results] = await db.query(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            if (results.length === 0) {
                return res.status(401).json({ error: 'User not found' });
            }

            const user = results[0];
            const isMatch = await bcrypt.compare(password, user.password_hash);

            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid password' });
            }

            const accessToken = jwt.sign(
                { id: user.id },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            const refreshToken = jwt.sign(
                { id: user.id },
                process.env.JWT_REFRESH_SECRET,
                { expiresIn: '7d' }
            );

            const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

            await db.query(
                'UPDATE users SET refresh_token_hash = ? WHERE id = ?',
                [hashedRefreshToken, user.id]
            );

            const cookieOptions = getCookieOptions();

            res.cookie('accessToken', accessToken, {
                ...cookieOptions,
                maxAge: 60 * 60 * 1000,
            });

            res.cookie('refreshToken', refreshToken, {
                ...cookieOptions,
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });

            return res.json({
                accessToken,
                user: { id: user.id, name: user.name, email: user.email },
            });
        } catch (loginError) {
            console.error('Login failed:', loginError.message);
            return res.status(500).json({ error: 'Login failed. Please try again.' });
        }
    });

    router.post('/refresh', async (req, res) => {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ error: 'No refresh token' });
        }

        try {
            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            const [users] = await db.query(
                'SELECT * FROM users WHERE id = ?',
                [decoded.id]
            );

            if (users.length === 0) {
                return res.status(403).json({ error: 'Invalid refresh token' });
            }

            const userRecord = users[0];
            const isValid = await bcrypt.compare(
                refreshToken,
                userRecord.refresh_token_hash
            );

            if (!isValid) {
                return res.status(403).json({ error: 'Invalid refresh token' });
            }

            const accessToken = jwt.sign(
                { id: userRecord.id },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            const cookieOptions = getCookieOptions();

            res.cookie('accessToken', accessToken, {
                ...cookieOptions,
                maxAge: 60 * 60 * 1000,
            });

            res.json({ accessToken });
        } catch (err) {
            return res.status(403).json({ error: 'Token expired' });
        }
    });

    return router;
};
