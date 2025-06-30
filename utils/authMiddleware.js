const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Authentication middleware
const isAuthenticated = (req, res, next) => {
    try {
        // Get token from header
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided, authorization denied' });
        }
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        
        // Add user data to request
        req.user = decoded;
        
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ error: 'Token is not valid' });
    }
};

// Admin authorization middleware
const isAdmin = async (req, res, next) => {
    try {
        // Check if user is authenticated first
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        // Query database to check if user is admin
        const [users] = await db.execute(
            'SELECT role FROM users WHERE id = ?', 
            [req.user.userId]
        );
        
        if (users.length === 0 || users[0].role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized as admin' });
        }
        
        next();
    } catch (error) {
        console.error('Admin middleware error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Coach authorization middleware
const isCoach = async (req, res, next) => {
    try {
        // Check if user is authenticated first
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        // Query database to check if user is a coach
        const [users] = await db.execute(
            'SELECT role FROM users WHERE id = ?', 
            [req.user.userId]
        );
        
        if (users.length === 0 || users[0].role !== 'coach') {
            return res.status(403).json({ error: 'Not authorized as coach' });
        }
        
        next();
    } catch (error) {
        console.error('Coach middleware error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

module.exports = { isAuthenticated, isAdmin, isCoach };
