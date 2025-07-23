const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkData() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });
    
    console.log('=== CHECKING AVAILABILITY DATA FOR JULY 23, 2025 ===');
    const [slots] = await connection.execute(`
        SELECT id, coach_id, date, start_time, end_time, session_type, duration, is_booked
        FROM coach_availability 
        WHERE date = '2025-07-23' 
        ORDER BY start_time, session_type
    `);
    
    console.log(`Found ${slots.length} slots:`);
    slots.forEach(slot => {
        console.log(`ID: ${slot.id}, Time: ${slot.start_time}-${slot.end_time}, Type: ${slot.session_type}, Duration: ${slot.duration}min, Booked: ${slot.is_booked}`);
    });
    
    console.log('\n=== CHECKING NORMAL VS BILAN SEPARATION ===');
    const normalSlots = slots.filter(s => s.session_type === 'normal');
    const bilanSlots = slots.filter(s => s.session_type === 'bilan');
    
    console.log(`Normal slots: ${normalSlots.length}`);
    normalSlots.slice(0, 5).forEach(slot => {
        console.log(`  Normal: ${slot.start_time}-${slot.end_time} (${slot.duration}min)`);
    });
    
    console.log(`Bilan slots: ${bilanSlots.length}`);
    bilanSlots.slice(0, 5).forEach(slot => {
        console.log(`  Bilan: ${slot.start_time}-${slot.end_time} (${slot.duration}min)`);
    });
    
    await connection.end();
}

checkData().catch(console.error);
