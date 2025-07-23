const db = require('./config/database');

async function testReservations() {
    try {
        const [rows] = await db.execute('SELECT id, session_type, is_free, time, date FROM reservations WHERE status != "cancelled" LIMIT 3');
        console.log('Sample reservations:', JSON.stringify(rows, null, 2));
        process.exit();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

testReservations();
