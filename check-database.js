const db = require('./config/database');

async function checkDatabase() {
    try {
        console.log('Checking database tables...');
        
        // Show all tables
        const [tables] = await db.execute('SHOW TABLES');
        console.log('Existing tables:');
        tables.forEach(table => {
            console.log('- ' + Object.values(table)[0]);
        });
        
        // Check if packs table exists
        try {
            const [packsCheck] = await db.execute('SELECT COUNT(*) as count FROM packs');
            console.log('\nPacks table exists with', packsCheck[0].count, 'records');
        } catch (err) {
            console.log('\nPacks table does NOT exist');
        }
        
        // Check if user_packs table exists
        try {
            const [userPacksCheck] = await db.execute('SELECT COUNT(*) as count FROM user_packs');
            console.log('User_packs table exists with', userPacksCheck[0].count, 'records');
        } catch (err) {
            console.log('User_packs table does NOT exist');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Database check error:', error);
        process.exit(1);
    }
}

checkDatabase();
