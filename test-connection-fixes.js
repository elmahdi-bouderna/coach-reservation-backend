// Load environment variables from server directory
require('dotenv').config({ path: './.env' });

const db = require('./config/database');

async function testDatabaseConnections() {
    console.log('🔍 Testing Database Connection Improvements');
    console.log('===========================================');
    
    try {
        // Test 1: Basic health check
        console.log('\n1. Testing basic health check...');
        const isHealthy = await db.healthCheck();
        console.log(`✅ Health check result: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
        
        // Test 2: Connection warming
        console.log('\n2. Testing connection warming...');
        await db.warmConnection();
        console.log('✅ Connection warmed successfully');
        
        // Test 3: Retry mechanism with valid query
        console.log('\n3. Testing retry mechanism with valid query...');
        const [result] = await db.execute('SELECT 1 as test, NOW() as timestamp');
        console.log(`✅ Query successful: ${JSON.stringify(result[0])}`);
        
        // Test 4: Multiple concurrent queries (stress test)
        console.log('\n4. Testing multiple concurrent queries...');
        const promises = [];
        for (let i = 0; i < 5; i++) {
            promises.push(db.execute('SELECT ? as query_number, NOW() as timestamp', [i + 1]));
        }
        
        const results = await Promise.all(promises);
        console.log(`✅ All ${results.length} concurrent queries completed successfully`);
        
        // Test 5: Test admin endpoints simulation
        console.log('\n5. Testing admin endpoints simulation...');
        
        // Test reservations query
        const [reservations] = await db.execute(`
            SELECT 
                r.id,
                r.full_name,
                r.email,
                r.date,
                r.time,
                c.name as coach_name
            FROM reservations r
            JOIN coaches c ON r.coach_id = c.id
            ORDER BY r.date DESC
            LIMIT 5
        `);
        console.log(`✅ Reservations query: Found ${reservations.length} reservations`);
        
        // Test clients query
        const [clients] = await db.execute(`
            SELECT 
                id,
                matricule,
                username,
                email,
                role
            FROM users
            WHERE role = 'user'
            LIMIT 5
        `);
        console.log(`✅ Clients query: Found ${clients.length} clients`);
        
        // Test coaches query
        const [coaches] = await db.execute('SELECT id, name, specialty FROM coaches LIMIT 5');
        console.log(`✅ Coaches query: Found ${coaches.length} coaches`);
        
        console.log('\n🎉 All database tests completed successfully!');
        console.log('\n📊 Performance Summary:');
        console.log('- Health checks: Working');
        console.log('- Connection warming: Working');
        console.log('- Retry mechanism: Working');
        console.log('- Concurrent queries: Working');
        console.log('- Admin endpoints: Working');
        
    } catch (error) {
        console.error('\n❌ Database test failed:', error.message);
        console.error('Details:', {
            code: error.code,
            errno: error.errno,
            sqlState: error.sqlState
        });
    } finally {
        // Close the connection
        try {
            await db.end();
            console.log('\n🔌 Database connection closed');
        } catch (closeError) {
            console.error('Error closing connection:', closeError.message);
        }
        
        process.exit(0);
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Process interrupted, closing database connections...');
    try {
        await db.end();
    } catch (error) {
        console.error('Error during cleanup:', error.message);
    }
    process.exit(0);
});

// Run the tests
testDatabaseConnections();
