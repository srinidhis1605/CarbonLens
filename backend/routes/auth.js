const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

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

    return router;
};