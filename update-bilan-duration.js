const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateBilanDuration() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT
        });

        console.log('Connected to database');
        
        // Check current bilan sessions
        console.log('\n=== CURRENT BILAN SESSIONS ===');
        const [currentBilan] = await connection.execute(`
            SELECT id, start_time, end_time, session_type, duration
            FROM coach_availability 
            WHERE session_type = 'bilan'
            ORDER BY date, start_time
            LIMIT 10
        `);
        
        console.log(`Found ${currentBilan.length} bilan sessions (showing first 10):`);
        currentBilan.forEach(slot => {
            console.log(`ID: ${slot.id}, Time: ${slot.start_time}-${slot.end_time}, Duration: ${slot.duration}min`);
        });

        // Update duration from 30 to 25 for all bilan sessions
        console.log('\n=== UPDATING BILAN DURATION ===');
        const [updateResult] = await connection.execute(`
            UPDATE coach_availability 
            SET duration = 25 
            WHERE session_type = 'bilan' AND duration = 30
        `);
        
        console.log(`Updated ${updateResult.affectedRows} bilan sessions from 30min to 25min`);

        // Update end_time for bilan sessions to be start_time + 25 minutes
        console.log('\n=== UPDATING BILAN END TIMES ===');
        const [bilanSlots] = await connection.execute(`
            SELECT id, start_time, end_time
            FROM coach_availability 
            WHERE session_type = 'bilan'
        `);
        
        for (const slot of bilanSlots) {
            // Parse start time and add 25 minutes
            const [hours, minutes] = slot.start_time.split(':').map(Number);
            const totalMinutes = hours * 60 + minutes + 25;
            const newEndHours = Math.floor(totalMinutes / 60);
            const newEndMinutes = totalMinutes % 60;
            const newEndTime = `${newEndHours.toString().padStart(2, '0')}:${newEndMinutes.toString().padStart(2, '0')}:00`;
            
            await connection.execute(`
                UPDATE coach_availability 
                SET end_time = ? 
                WHERE id = ?
            `, [newEndTime, slot.id]);
        }
        
        console.log(`Updated end times for ${bilanSlots.length} bilan sessions`);
        
        // Show updated bilan sessions
        console.log('\n=== UPDATED BILAN SESSIONS ===');
        const [updatedBilan] = await connection.execute(`
            SELECT id, start_time, end_time, session_type, duration
            FROM coach_availability 
            WHERE session_type = 'bilan'
            ORDER BY date, start_time
            LIMIT 10
        `);
        
        console.log(`Updated bilan sessions (showing first 10):`);
        updatedBilan.forEach(slot => {
            console.log(`ID: ${slot.id}, Time: ${slot.start_time}-${slot.end_time}, Duration: ${slot.duration}min`);
        });

        await connection.end();
        console.log('\nBilan duration update completed!');
        
    } catch (error) {
        console.error('Database error:', error.message);
    }
}

updateBilanDuration();
