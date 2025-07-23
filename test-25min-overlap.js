const mysql = require('mysql2/promise');
require('dotenv').config();

async function testNewOverlapDetection() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });
    
    console.log('=== TESTING NEW 25-MINUTE BILAN OVERLAP DETECTION ===');
    
    // Test scenario 1: Book a bilan session 8:00-8:25
    console.log('\n--- Scenario 1: Booking Bilan 8:00-8:25 ---');
    console.log('Expected overlaps: 8:00-8:55 (normal)');
    console.log('Should NOT overlap: 8:30-8:55 (bilan) - has 5-min gap');
    
    const coachId = 24; // Use coach 24 that has both types
    const date = '2025-07-24'; // Use the date that has bilan slots
    const reservationStart1 = '08:00:00';
    const reservationEnd1 = '08:25:00';
    
    const [overlaps1] = await connection.execute(`
        SELECT id, start_time, end_time, session_type, duration
        FROM coach_availability 
        WHERE coach_id = ? AND date = ? AND is_booked = 0
        AND start_time < ? AND end_time > ?
        ORDER BY start_time
    `, [coachId, date, reservationEnd1, reservationStart1]);
    
    console.log(`Found ${overlaps1.length} overlaps for Bilan 8:00-8:25:`);
    overlaps1.forEach(slot => {
        const overlaps = (slot.start_time < reservationEnd1 && slot.end_time > reservationStart1);
        console.log(`- ${slot.start_time}-${slot.end_time} (${slot.session_type}, ${slot.duration}min) - Overlaps: ${overlaps ? 'YES' : 'NO'}`);
    });
    
    // Test scenario 2: Book a normal session 8:30-9:25
    console.log('\n--- Scenario 2: Booking Normal 8:30-9:25 ---');
    console.log('Expected overlaps: 8:00-8:55, 8:30-8:55 (bilan), 9:00-9:55');
    
    const reservationStart2 = '08:30:00';
    const reservationEnd2 = '09:25:00';
    
    const [overlaps2] = await connection.execute(`
        SELECT id, start_time, end_time, session_type, duration
        FROM coach_availability 
        WHERE coach_id = ? AND date = ? AND is_booked = 0
        AND start_time < ? AND end_time > ?
        ORDER BY start_time
    `, [coachId, date, reservationEnd2, reservationStart2]);
    
    console.log(`Found ${overlaps2.length} overlaps for Normal 8:30-9:25:`);
    overlaps2.forEach(slot => {
        const overlaps = (slot.start_time < reservationEnd2 && slot.end_time > reservationStart2);
        console.log(`- ${slot.start_time}-${slot.end_time} (${slot.session_type}, ${slot.duration}min) - Overlaps: ${overlaps ? 'YES' : 'NO'}`);
    });
    
    // Manual validation
    console.log('\n=== MANUAL VALIDATION ===');
    console.log('Gap analysis:');
    console.log('8:00-8:25 (bilan) and 8:30-8:55 (bilan): 5-minute gap (8:25 to 8:30) - Should NOT conflict');
    console.log('8:00-8:25 (bilan) and 8:00-8:55 (normal): Overlap (8:00-8:25) - Should conflict');
    console.log('8:30-9:25 (normal) and 8:30-8:55 (bilan): Overlap (8:30-8:55) - Should conflict');
    
    await connection.end();
}

testNewOverlapDetection().catch(console.error);
