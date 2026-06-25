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
            res.status(200).json({ message: "Login successful!", user: { id: user.id, name: user.name } });
        } else {
            res.status(401).json({ error: "Invalid password" });
        }
    });
});

    return router;
};