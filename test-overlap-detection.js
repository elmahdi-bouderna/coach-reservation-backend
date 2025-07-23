const mysql = require('mysql2/promise');
require('dotenv').config();

async function testOverlapDetection() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });
    
    console.log('=== TESTING OVERLAP DETECTION ===');
    console.log('Scenario: Booking Normal session 8:30-9:25');
    console.log('Expected overlaps: 8:00-8:55, 8:30-9:00 (bilan), 9:00-9:55');
    
    const coachId = 16; // Use coach 16 that has slots
    const date = '2025-07-23';
    const reservationStart = '08:30:00';
    const reservationEnd = '09:25:00';
    
    // Test the overlap detection query
    const [overlappingSlots] = await connection.execute(`
        SELECT id, start_time, end_time, session_type, duration
        FROM coach_availability 
        WHERE coach_id = ? 
        AND date = ? 
        AND is_booked = 0
        AND start_time < ?
        AND end_time > ?
        ORDER BY start_time
    `, [coachId, date, reservationEnd, reservationStart]);
    
    console.log(`\nFound ${overlappingSlots.length} overlapping slots for Normal 8:30-9:25:`);
    overlappingSlots.forEach(slot => {
        const overlaps = (slot.start_time < reservationEnd && slot.end_time > reservationStart);
        console.log(`- ${slot.start_time}-${slot.end_time} (${slot.session_type}, ${slot.duration}min) - ID: ${slot.id}`);
    });
    
    console.log('\n=== WHAT SHOULD HAPPEN ===');
    console.log('When booking Normal 8:30-9:25, these slots should be marked as booked:');
    console.log('1. 08:00:00-08:55:00 (normal) - overlaps because 8:00 < 9:25 AND 8:55 > 8:30');
    console.log('2. 08:30:00-09:25:00 (normal) - the actual booked slot');  
    console.log('3. 09:00:00-09:55:00 (normal) - overlaps because 9:00 < 9:25 AND 9:55 > 8:30');
    
    console.log('\nSlots that should NOT be marked as booked:');
    console.log('- 07:00:00-07:55:00 (normal) - no overlap because 7:55 <= 8:30');
    console.log('- 10:00:00-10:55:00 (normal) - no overlap because 10:00 >= 9:25');
    
    await connection.end();
}

testOverlapDetection().catch(console.error);
