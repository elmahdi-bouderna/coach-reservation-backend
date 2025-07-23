const mysql = require('mysql2/promise');
require('dotenv').config();

async function findBilanSlots() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });
    
    const [bilanSlots] = await connection.execute('SELECT DISTINCT coach_id FROM coach_availability WHERE session_type = "bilan"');
    console.log('Coaches with bilan slots:');
    bilanSlots.forEach(s => console.log('Coach ID:', s.coach_id));
    
    if (bilanSlots.length > 0) {
        const coachId = bilanSlots[0].coach_id;
        console.log(`\nChecking what dates coach ${coachId} has bilan slots:`);
        
        const [dates] = await connection.execute(`
            SELECT DISTINCT date 
            FROM coach_availability 
            WHERE coach_id = ? AND session_type = 'bilan'
            ORDER BY date
        `, [coachId]);
        
        console.log('Dates with bilan slots:');
        dates.forEach(d => console.log(d.date));
        
        if (dates.length > 0) {
            const testDate = dates[0].date;
            console.log(`\nChecking slots for coach ${coachId} on ${testDate}:`);
            
            const [slots] = await connection.execute(`
                SELECT start_time, end_time, session_type, duration, is_booked
                FROM coach_availability 
                WHERE coach_id = ? AND date = ?
                ORDER BY start_time
            `, [coachId, testDate]);
            
            slots.forEach(slot => {
                console.log(`${slot.start_time}-${slot.end_time} (${slot.session_type}, ${slot.duration}min): ${slot.is_booked ? 'BOOKED' : 'Available'}`);
            });
        }
    }
    
    await connection.end();
}

findBilanSlots().catch(console.error);
