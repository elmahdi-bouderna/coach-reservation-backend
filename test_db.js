const mysql = require('mysql2/promise');
require('dotenv').config();

async function testDatabaseConnection() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT
        });

        console.log('Connected to database successfully');
        
        // Check coach_availability table structure
        console.log('\n=== COACH_AVAILABILITY TABLE STRUCTURE ===');
        const [columns] = await connection.execute('DESCRIBE coach_availability');
        columns.forEach(col => {
            console.log(`${col.Field}: ${col.Type} | ${col.Null} | ${col.Key} | ${col.Default}`);
        });

        // Test if we can insert a simple availability slot
        console.log('\n=== TESTING INSERT ===');
        try {
            await connection.execute(`
                INSERT INTO coach_availability 
                (coach_id, date, start_time, end_time, duration, is_derived, session_type, is_free) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [1, '2025-07-25', '09:00:00', '09:55:00', 55, false, 'normal', false]);
            console.log('Test insert successful');
            
            // Clean up test data
            await connection.execute(`
                DELETE FROM coach_availability 
                WHERE coach_id = 1 AND date = '2025-07-25' AND start_time = '09:00:00'
            `);
            console.log('Test data cleaned up');
        } catch (insertError) {
            console.error('Insert test failed:', insertError.message);
        }

        await connection.end();
        
    } catch (error) {
        console.error('Database connection error:', error.message);
    }
}

testDatabaseConnection();
