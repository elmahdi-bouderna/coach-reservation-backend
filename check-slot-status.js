const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkCurrentStatus() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });
    
    const [coaches] = await connection.execute('SELECT id, name FROM coaches');
    console.log('Available coaches:');
    coaches.forEach(c => console.log(`ID: ${c.id}, Name: ${c.name}`));
    
    const [coachsWithSlots] = await connection.execute('SELECT DISTINCT coach_id FROM coach_availability WHERE date = "2025-07-23"');
    console.log('\nCoaches with availability on 2025-07-23:');
    coachsWithSlots.forEach(s => console.log(`Coach ID: ${s.coach_id}`));
    
    // Check status for coach 24 specifically
    console.log(`\nSlot status for Coach ID 24 on 2025-07-23:`);
    
    const [slots] = await connection.execute(`
        SELECT start_time, end_time, session_type, duration, is_booked
        FROM coach_availability 
        WHERE coach_id = 24 AND date = '2025-07-23' 
        AND start_time BETWEEN '07:00:00' AND '11:00:00'
        ORDER BY start_time
    `);
    
    slots.forEach(slot => {
        console.log(`${slot.start_time}-${slot.end_time} (${slot.session_type}, ${slot.duration}min): ${slot.is_booked ? 'BOOKED' : 'Available'}`);
    });
    
    await connection.end();
}

checkCurrentStatus().catch(console.error);
