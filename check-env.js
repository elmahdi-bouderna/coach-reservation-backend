require('dotenv').config();

console.log('🔍 Environment Variables Check');
console.log('================================');
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('DB_HOST:', process.env.DB_HOST ? '✅ Set' : '❌ Missing');
console.log('DB_USER:', process.env.DB_USER ? '✅ Set' : '❌ Missing');
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '✅ Set (hidden)' : '❌ Missing');
console.log('DB_NAME:', process.env.DB_NAME ? '✅ Set' : '❌ Missing');
console.log('DB_PORT:', process.env.DB_PORT || 'Using default 3306');
console.log('DB_SSL:', process.env.DB_SSL || 'false');
console.log('================================');

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
    console.log('❌ Missing required database environment variables!');
    console.log('Please set: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
} else {
    console.log('✅ All required environment variables are set');
    
    // Test database connection
    const db = require('./config/database');
    
    db.healthCheck().then(isHealthy => {
        if (isHealthy) {
            console.log('✅ Database connection successful!');
        } else {
            console.log('❌ Database connection failed!');
        }
        process.exit(0);
    }).catch(error => {
        console.error('❌ Database connection error:', error.message);
        process.exit(1);
    });
}
