const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    // 1. Try to get token from header (Authorization: Bearer ...)
    // 2. OR try to get it from a cookie named 'accessToken'
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1] || req.cookies?.accessToken;

    if (!token) return res.status(401).json({ error: "Access denied, no token found" });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid token" });
        req.user = user;
        next();
    });
};

module.exports = authenticateToken;