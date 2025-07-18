const db = require('./config/database');

async function createTestData() {
    try {
        // Check existing coaches
        const [coaches] = await db.execute('SELECT * FROM coaches');
        console.log('Existing coaches:', coaches);
        
        if (coaches.length === 0) {
            console.log('No coaches found. Creating test coach...');
            
            // Create a test coach user first
            const bcrypt = require('bcrypt');
            const hashedPassword = await bcrypt.hash('coach123', 10);
            
            await db.execute(
                'INSERT INTO users (matricule, username, password, email, role) VALUES (?, ?, ?, ?, ?)',
                ['COACH001', 'coach1', hashedPassword, 'coach1@example.com', 'coach']
            );
            
            const [user] = await db.execute('SELECT * FROM users WHERE matricule = ?', ['COACH001']);
            
            // Create coach record
            await db.execute(
                'INSERT INTO coaches (user_id, name, specialty, bio, photo) VALUES (?, ?, ?, ?, ?)',
                [user[0].id, 'Test Coach', 'Fitness', 'Test coach for demo', 'default.jpg']
            );
            
            console.log('Test coach created successfully!');
        }
        
        // Get coach ID for creating availability
        const [coachList] = await db.execute('SELECT * FROM coaches');
        const coach = coachList[0];
        
        // Create test availability slots with proper time ranges
        const testSlots = [
            { date: '2025-07-17', start_time: '07:00', end_time: '08:00' },
            { date: '2025-07-17', start_time: '07:30', end_time: '08:30' },
            { date: '2025-07-17', start_time: '08:00', end_time: '09:00' },
            { date: '2025-07-17', start_time: '09:00', end_time: '10:00' },
            { date: '2025-07-17', start_time: '10:00', end_time: '11:00' },
            { date: '2025-07-18', start_time: '07:00', end_time: '08:00' },
            { date: '2025-07-18', start_time: '09:00', end_time: '10:00' },
            { date: '2025-07-18', start_time: '10:00', end_time: '11:00' },
        ];
        
        for (const slot of testSlots) {
            try {
                // Calculate duration in minutes
                const [startHour, startMin] = slot.start_time.split(':').map(Number);
                const [endHour, endMin] = slot.end_time.split(':').map(Number);
                const duration = (endHour * 60 + endMin) - (startHour * 60 + startMin);
                
                await db.execute(
                    'INSERT INTO coach_availability (coach_id, date, start_time, end_time, duration, is_booked) VALUES (?, ?, ?, ?, ?, ?)',
                    [coach.id, slot.date, slot.start_time, slot.end_time, duration, 0]
                );
                console.log(`Created slot: ${slot.date} ${slot.start_time} - ${slot.end_time}`);
            } catch (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    console.log(`Slot already exists: ${slot.date} ${slot.start_time} - ${slot.end_time}`);
                } else {
                    console.error('Error creating slot:', error);
                }
            }
        }
        
        // Show current availability
        const [availability] = await db.execute(
            'SELECT a.*, c.name as coach_name FROM coach_availability a JOIN coaches c ON a.coach_id = c.id ORDER BY a.date, a.start_time'
        );
        console.log('Current availability slots:', availability);
        
    } catch (error) {
        console.error('Error creating test data:', error);
    } finally {
        await db.end();
    }
}

createTestData();
