const db = require('../config/database');

// Database error handling middleware
const handleDatabaseError = (error, req, res, next) => {
    console.error('Database error occurred:', {
        message: error.message,
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        url: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
    });

    // Connection-related errors
    const connectionErrors = [
        'ECONNRESET',
        'ENOTFOUND', 
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ER_ACCESS_DENIED_ERROR',
        'PROTOCOL_CONNECTION_LOST'
    ];

    if (connectionErrors.includes(error.code) || error.fatal) {
        console.log('Database connection issue detected, attempting to recover...');
        
        // Try to warm the connection
        db.warmConnection().catch(warmError => {
            console.error('Failed to warm connection during error recovery:', warmError.message);
        });

        return res.status(503).json({
            error: 'Database temporarily unavailable. Please try again in a moment.',
            code: 'DB_CONNECTION_ERROR',
            retry: true
        });
    }

    // Timeout errors
    if (error.message.includes('timeout') || error.code === 'TIMEOUT') {
        return res.status(504).json({
            error: 'Database operation timed out. Please try again.',
            code: 'DB_TIMEOUT',
            retry: true
        });
    }

    // Syntax or constraint errors (don't retry)
    const permanentErrors = [
        'ER_PARSE_ERROR',
        'ER_NO_SUCH_TABLE',
        'ER_BAD_FIELD_ERROR',
        'ER_DUP_ENTRY'
    ];

    if (permanentErrors.includes(error.code)) {
        return res.status(400).json({
            error: 'Invalid request. Please check your data.',
            code: 'DB_INVALID_REQUEST',
            retry: false
        });
    }

    // Generic database error
    return res.status(500).json({
        error: 'Database operation failed. Please try again.',
        code: 'DB_GENERIC_ERROR',
        retry: true
    });
};

// Wrapper for async route handlers with automatic error handling
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch((error) => {
            // Check if it's a database-related error
            if (error.code || error.errno || error.sqlState || error.fatal !== undefined) {
                return handleDatabaseError(error, req, res, next);
            }
            // For non-database errors, pass to the next error handler
            next(error);
        });
    };
};

module.exports = {
    handleDatabaseError,
    asyncHandler
};
