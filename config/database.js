const mysql = require('mysql2');
require('dotenv').config();

// Enhanced pool configuration for free hosting (AlwaysData/Heroku)
const poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'coaching_system',
    port: process.env.DB_PORT || 3306,
    timezone: '+01:00',
    waitForConnections: true,
    connectionLimit: process.env.NODE_ENV === 'production' ? 2 : 10, // Very low for free hosting
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
            console.log(`Database query attempt ${attempt}/${maxRetries}: ${query.substring(0, 50)}...`);
            const result = await promisePool.execute(query, params);
            console.log(`Database query successful on attempt ${attempt}`);
            return result;
        } catch (error) {
            lastError = error;
            console.error(`Database query failed on attempt ${attempt}:`, error.message);
            console.error(`Error code: ${error.code}, Error number: ${error.errno}`);
            
            // Check if it's a connection-related error or database not available
            const isConnectionError = 
                error.code === 'ECONNRESET' ||
                error.code === 'ENOTFOUND' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNREFUSED' ||
                error.code === 'ER_ACCESS_DENIED_ERROR' ||
                error.code === 'ER_BAD_DB_ERROR' ||
                error.code === 'ER_NO_SUCH_TABLE' ||
                error.errno === 1146 || // Table doesn't exist
                error.errno === 1049 || // Database doesn't exist
                error.fatal === true ||
                error.message.includes('connection') ||
                error.message.includes('timeout') ||
                error.message.includes('PROTOCOL_CONNECTION_LOST');
            
            if (isConnectionError && attempt < maxRetries) {
                const delayMs = attempt * 2000; // Increase delay: 2s, 4s, 6s
                console.log(`Connection error detected, retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
            }
            
            // If it's not a connection error or we've exceeded retries, throw the error
            if (attempt === maxRetries) {
                console.error(`Final attempt failed. Throwing error: ${lastError.message}`);
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

// Warm the connection on startup and every 4 minutes
warmConnection();
setInterval(warmConnection, 4 * 60 * 1000); // Every 4 minutes

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