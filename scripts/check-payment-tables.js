const db = require('../config/database');

async function checkAndCreatePaymentTables() {
    try {
        console.log('Checking if payment system tables exist...');
        
        // Check if payment_plans table exists
        const [tables] = await db.execute(`
            SELECT TABLE_NAME 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME IN ('payment_plans', 'payment_installments', 'payment_reminders', 'payment_history')
        `);
        
        const existingTables = tables.map(row => row.TABLE_NAME);
        console.log('Existing payment tables:', existingTables);
        
        if (existingTables.length === 0) {
            console.log('Payment system tables not found. You need to run the SQL script.');
            console.log('Please execute the SQL file: database/add_payment_system.sql');
            console.log('This can be done through:');
            console.log('1. phpMyAdmin');
            console.log('2. MySQL Workbench');
            console.log('3. Command line MySQL client');
            return false;
        } else if (existingTables.length < 4) {
            console.log('Some payment tables are missing. Please run the complete SQL script.');
            return false;
        } else {
            console.log('All payment system tables exist!');
            return true;
        }
        
    } catch (error) {
        console.error('Error checking payment tables:', error);
        return false;
    }
}

// Test database connection and table existence
async function testConnection() {
    try {
        const [result] = await db.execute('SELECT 1 as test');
        console.log('Database connection successful!');
        
        const tablesExist = await checkAndCreatePaymentTables();
        
        if (tablesExist) {
            // Test a simple query to the payment tables
            try {
                const [stats] = await db.execute(`
                    SELECT COUNT(*) as payment_plans_count FROM payment_plans
                `);
                console.log('Payment plans in database:', stats[0].payment_plans_count);
            } catch (error) {
                console.error('Error querying payment tables:', error);
            }
        }
        
    } catch (error) {
        console.error('Database connection failed:', error);
        console.log('Please check your database configuration in server/.env');
    }
}

if (require.main === module) {
    testConnection().then(() => {
        process.exit(0);
    });
}

module.exports = { checkAndCreatePaymentTables };
