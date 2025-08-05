const db = require('./config/database');

// Test to mimic the exact behavior of the failing endpoints
async function testFailingEndpoints() {
    console.log('Testing endpoints that are failing with 503 errors...');
    
    // Test packs endpoint
    try {
        console.log('\n1. Testing /api/packs endpoint query...');
        const [packs] = await db.execute('SELECT * FROM packs WHERE is_active = 1 ORDER BY points ASC');
        console.log('✅ Packs endpoint would return:', packs.length, 'packs');
        console.log('First pack:', packs[0]?.name || 'No packs found');
    } catch (error) {
        console.error('❌ Packs endpoint would fail with error:', error.message);
        console.error('Error code:', error.code);
        console.error('Error errno:', error.errno);
        console.error('Error fatal:', error.fatal);
    }

    // Test group-courses endpoint 
    try {
        console.log('\n2. Testing /api/group-courses endpoint query...');
        const [courses] = await db.execute(`
            SELECT gc.*, c.name as coach_name, c.specialty, c.photo,
                   (SELECT COUNT(*) FROM group_reservations gr WHERE gr.course_id = gc.id AND gr.status = 'confirmed') as current_participants
            FROM group_courses gc
            JOIN coaches c ON gc.coach_id = c.id
            WHERE gc.is_active = 1
            ORDER BY gc.date ASC, gc.time ASC
        `);
        console.log('✅ Group courses endpoint would return:', courses.length, 'courses');
        if (courses.length > 0) {
            console.log('First course:', courses[0]?.title || 'No title');
        }
    } catch (error) {
        console.error('❌ Group courses endpoint would fail with error:', error.message);
        console.error('Error code:', error.code);
        console.error('Error errno:', error.errno);
        console.error('Error fatal:', error.fatal);
    }

    // Test coaches endpoint (the one that works)
    try {
        console.log('\n3. Testing /api/coaches endpoint query (for comparison)...');
        const [coaches] = await db.execute('SELECT * FROM coaches ORDER BY name ASC');
        console.log('✅ Coaches endpoint would return:', coaches.length, 'coaches');
        console.log('First coach:', coaches[0]?.name || 'No coaches found');
    } catch (error) {
        console.error('❌ Coaches endpoint would fail with error:', error.message);
        console.error('Error code:', error.code);
        console.error('Error errno:', error.errno);
        console.error('Error fatal:', error.fatal);
    }

    // Test database health
    try {
        console.log('\n4. Testing database health...');
        const isHealthy = await db.healthCheck();
        console.log('Database health check result:', isHealthy ? '✅ Healthy' : '❌ Unhealthy');
    } catch (error) {
        console.error('❌ Health check failed:', error.message);
    }

    process.exit(0);
}

testFailingEndpoints();
