const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkCoaches() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT
        });

        console.log('=== EXISTING COACHES ===');
        const [coaches] = await connection.execute('SELECT id, name FROM coaches ORDER BY id');
        coaches.forEach(coach => {
            console.log(`ID: ${coach.id}, Name: ${coach.name}`);
        });

        if (coaches.length > 0) {
            const testCoachId = coaches[0].id;
            console.log(`\n=== TESTING INSERT WITH COACH ID ${testCoachId} ===`);
            try {
                await connection.execute(`
                    INSERT INTO coach_availability 
                    (coach_id, date, start_time, end_time, duration, is_derived, session_type, is_free) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [testCoachId, '2025-07-25', '09:00:00', '09:55:00', 55, false, 'normal', false]);
                console.log('Test insert successful');
                
                // Clean up test data
                await connection.execute(`
                    DELETE FROM coach_availability 
                    WHERE coach_id = ? AND date = '2025-07-25' AND start_time = '09:00:00'
                `, [testCoachId]);
                console.log('Test data cleaned up');
            } catch (insertError) {
                console.error('Insert test failed:', insertError.message);
            }
        }

        await connection.end();
        
    } catch (error) {
        console.error('Database error:', error.message);
    }
}

checkCoaches();
