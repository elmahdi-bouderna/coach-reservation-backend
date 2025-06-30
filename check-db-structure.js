const db = require('./config/database');

async function checkDatabase() {
    try {
        console.log('📊 Checking database structure...\n');
        
        // Check users table
        const [users] = await db.execute('DESCRIBE users');
        console.log('👤 Users table structure:');
        users.forEach(col => console.log(`- ${col.Field}: ${col.Type}`));
        
        // Check reservations table
        const [reservations] = await db.execute('DESCRIBE reservations');
        console.log('\n📅 Reservations table structure:');
        reservations.forEach(col => console.log(`- ${col.Field}: ${col.Type}`));
        
        // Check user_packs table
        const [userPacks] = await db.execute('DESCRIBE user_packs');
        console.log('\n📦 User_packs table structure:');
        userPacks.forEach(col => console.log(`- ${col.Field}: ${col.Type}`));
        
        // Sample user data
        const [sampleUsers] = await db.execute('SELECT id, matricule, username, email, full_name, phone, age, gender, points FROM users LIMIT 3');
        console.log('\n👥 Sample user data:');
        sampleUsers.forEach(user => {
            console.log(`- ID: ${user.id}, Name: ${user.full_name || user.username}, Points: ${user.points}`);
        });
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkDatabase();
