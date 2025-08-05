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

// Check specific problematic endpoints
router.get('/endpoints', async (req, res) => {
    const results = {
        timestamp: new Date().toISOString(),
        tests: {}
    };
    
    // Test packs endpoint
    try {
        const startTime = Date.now();
        const [packs] = await db.execute('SELECT COUNT(*) as count FROM packs WHERE is_active = 1');
        results.tests.packs = {
            status: 'success',
            count: packs[0].count,
            responseTime: `${Date.now() - startTime}ms`
        };
    } catch (error) {
        results.tests.packs = {
            status: 'error',
            error: error.message,
            errno: error.errno,
            code: error.code
        };
    }
    
    // Test group courses endpoint
    try {
        const startTime = Date.now();
        const [courses] = await db.execute('SELECT COUNT(*) as count FROM group_courses WHERE is_active = 1');
        results.tests.group_courses = {
            status: 'success',
            count: courses[0].count,
            responseTime: `${Date.now() - startTime}ms`
        };
    } catch (error) {
        results.tests.group_courses = {
            status: 'error',
            error: error.message,
            errno: error.errno,
            code: error.code
        };
    }
    
    // Test coaches endpoint (which works)
    try {
        const startTime = Date.now();
        const [coaches] = await db.execute('SELECT COUNT(*) as count FROM coaches');
        results.tests.coaches = {
            status: 'success',
            count: coaches[0].count,
            responseTime: `${Date.now() - startTime}ms`
        };
    } catch (error) {
        results.tests.coaches = {
            status: 'error',
            error: error.message,
            errno: error.errno,
            code: error.code
        };
    }
    
    // Determine overall status
    const hasErrors = Object.values(results.tests).some(test => test.status === 'error');
    const statusCode = hasErrors ? 503 : 200;
    
    res.status(statusCode).json(results);
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
