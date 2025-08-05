const mysql = require('mysql2');
require('dotenv').config();

// Enhanced pool configuration for free hosting (AlwaysData)
const poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'coaching_system',
    port: process.env.DB_PORT || 3306,
    timezone: '+01:00',
    waitForConnections: true,
    connectionLimit: 3, // Further reduced for Heroku + free hosting
    queueLimit: 0,
    // Handle connection issues gracefully
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

const pool = mysql.createPool(poolConfig);
const promisePool = pool.promise();

// Connection health check
const healthCheck = async () => {
    try {
        const [result] = await promisePool.execute('SELECT 1 as health');
        return result[0].health === 1;
    } catch (error) {
        console.error('Database health check failed:', error.message);
        return false;
    }
};

// Retry mechanism for database operations
const executeWithRetry = async (query, params = [], maxRetries = 3) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Database query attempt ${attempt}/${maxRetries}`);
            const result = await promisePool.execute(query, params);
            console.log(`Database query successful on attempt ${attempt}`);
            return result;
        } catch (error) {
            lastError = error;
            console.error(`Database query failed on attempt ${attempt}:`, error.message);
            
            // Check if it's a connection-related error
            const isConnectionError = 
                error.code === 'ECONNRESET' ||
                error.code === 'ENOTFOUND' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNREFUSED' ||
                error.fatal === true ||
                error.message.includes('connection') ||
                error.message.includes('timeout');
            
            if (isConnectionError && attempt < maxRetries) {
                console.log(`Connection error detected, retrying in ${attempt * 1000}ms...`);
                await new Promise(resolve => setTimeout(resolve, attempt * 1000));
                continue;
            }
            
            // If it's not a connection error or we've exceeded retries, throw the error
            if (attempt === maxRetries) {
                throw lastError;
            }
        }
    }
};

// Database connection warming (keeps connection alive)
const warmConnection = async () => {
    try {
        await executeWithRetry('SELECT 1');
        console.log('Database connection warmed successfully');
    } catch (error) {
        console.error('Failed to warm database connection:', error.message);
    }
};

// Warm the connection on startup and every 10 minutes (reduced frequency for free hosting)
warmConnection();
setInterval(warmConnection, 10 * 60 * 1000); // Every 10 minutes

// Handle pool errors
pool.on('connection', (connection) => {
    console.log('New database connection established');
});

pool.on('error', (err) => {
    console.error('Database pool error:', err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('Database connection lost, will attempt to reconnect...');
    }
});

// Enhanced promisePool with retry mechanism
const enhancedPool = {
    execute: executeWithRetry,
    query: async (query, params, maxRetries = 3) => {
        return executeWithRetry(query, params, maxRetries);
    },
    healthCheck,
    warmConnection,
    getConnection: () => promisePool.getConnection(),
    end: () => pool.end()
};

module.exports = enhancedPool;