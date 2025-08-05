const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Health check endpoint
router.get('/', async (req, res) => {
    const startTime = Date.now();
    
    try {
        // Check database connectivity
        const isDbHealthy = await db.healthCheck();
        const responseTime = Date.now() - startTime;
        
        if (isDbHealthy) {
            res.json({
                status: 'healthy',
                database: 'connected',
                responseTime: `${responseTime}ms`,
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        } else {
            throw new Error('Database health check failed');
        }
    } catch (error) {
        console.error('Health check failed:', error);
        const responseTime = Date.now() - startTime;
        
        res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message,
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    }
});

// Database connection test endpoint
router.get('/database', async (req, res) => {
    try {
        const startTime = Date.now();
        await db.execute('SELECT 1 as test, NOW() as server_time');
        const responseTime = Date.now() - startTime;
        
        res.json({
            status: 'connected',
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Database test failed:', error);
        res.status(503).json({
            status: 'failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Warm database connection endpoint
router.post('/warm', async (req, res) => {
    try {
        await db.warmConnection();
        res.json({
            status: 'warmed',
            message: 'Database connection warmed successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Connection warming failed:', error);
        res.status(500).json({
            status: 'failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
