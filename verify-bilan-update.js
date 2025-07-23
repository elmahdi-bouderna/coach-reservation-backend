const mysql = require('mysql2/promise');
require('dotenv').config();

async function verifyBilanUpdate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });
    
    console.log('=== VERIFYING BILAN UPDATE ===');
    
    // Check all bilan sessions to see if they were updated correctly
    const [bilanSlots] = await connection.execute(`
        SELECT id, coach_id, date, start_time, end_time, session_type, duration
        FROM coach_availability 
        WHERE session_type = 'bilan'
        ORDER BY coach_id, date, start_time
    `);
    
    console.log(`Found ${bilanSlots.length} total bilan sessions:`);
    
    let correctlyUpdated = 0;
    let needsUpdate = 0;
    
    bilanSlots.forEach(slot => {
        // Parse start time and calculate what end time should be (start + 25 minutes)
        const [hours, minutes] = slot.start_time.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes + 25;
        const expectedEndHours = Math.floor(totalMinutes / 60);
        const expectedEndMinutes = totalMinutes % 60;
        const expectedEndTime = `${expectedEndHours.toString().padStart(2, '0')}:${expectedEndMinutes.toString().padStart(2, '0')}:00`;
        
        const isCorrect = (slot.end_time === expectedEndTime && slot.duration === 25);
        
        console.log(`ID: ${slot.id}, Coach: ${slot.coach_id}, Date: ${slot.date.toISOString().split('T')[0]}`);
        console.log(`  Time: ${slot.start_time}-${slot.end_time}, Duration: ${slot.duration}min`);
        console.log(`  Expected: ${slot.start_time}-${expectedEndTime}, Duration: 25min`);
        console.log(`  Status: ${isCorrect ? '✅ CORRECT' : '❌ NEEDS UPDATE'}`);
        console.log('');
        
        if (isCorrect) {
            correctlyUpdated++;
        } else {
            needsUpdate++;
        }
    });
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`✅ Correctly updated: ${correctlyUpdated}`);
    console.log(`❌ Need update: ${needsUpdate}`);
    
    if (needsUpdate > 0) {
        console.log(`\n=== FIXING REMAINING SLOTS ===`);
        
        for (const slot of bilanSlots) {
            const [hours, minutes] = slot.start_time.split(':').map(Number);
            const totalMinutes = hours * 60 + minutes + 25;
            const expectedEndHours = Math.floor(totalMinutes / 60);
            const expectedEndMinutes = totalMinutes % 60;
            const expectedEndTime = `${expectedEndHours.toString().padStart(2, '0')}:${expectedEndMinutes.toString().padStart(2, '0')}:00`;
            
            if (slot.end_time !== expectedEndTime || slot.duration !== 25) {
                console.log(`Updating slot ${slot.id}: ${slot.start_time}-${slot.end_time} → ${slot.start_time}-${expectedEndTime}`);
                
                await connection.execute(`
                    UPDATE coach_availability 
                    SET end_time = ?, duration = 25 
                    WHERE id = ?
                `, [expectedEndTime, slot.id]);
            }
        }
        
        console.log(`Updated ${needsUpdate} remaining slots`);
    }
    
    await connection.end();
}

verifyBilanUpdate().catch(console.error);
