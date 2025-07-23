const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixUniqueConstraint() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT
        });

        console.log('Connected to database');
        
        // Check current indexes/constraints
        console.log('\n=== CURRENT INDEXES ON coach_availability ===');
        const [indexes] = await connection.execute('SHOW INDEX FROM coach_availability');
        indexes.forEach(index => {
            console.log(`Key: ${index.Key_name}, Column: ${index.Column_name}, Unique: ${index.Non_unique === 0 ? 'YES' : 'NO'}`);
        });

        // Drop the old unique constraint if it exists
        try {
            console.log('\n=== DROPPING OLD UNIQUE CONSTRAINT ===');
            await connection.execute('ALTER TABLE coach_availability DROP INDEX unique_slot');
            console.log('Old unique_slot constraint dropped');
        } catch (err) {
            if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
                console.log('unique_slot constraint does not exist, continuing...');
            } else {
                console.error('Error dropping constraint:', err.message);
            }
        }

        // Add new unique constraint that includes session_type
        try {
            console.log('\n=== ADDING NEW UNIQUE CONSTRAINT ===');
            await connection.execute(`
                ALTER TABLE coach_availability 
                ADD UNIQUE INDEX unique_slot_with_type (coach_id, date, start_time, session_type)
            `);
            console.log('New unique constraint added: (coach_id, date, start_time, session_type)');
        } catch (err) {
            if (err.code === 'ER_DUP_KEYNAME') {
                console.log('Constraint already exists with this name');
            } else {
                console.error('Error adding constraint:', err.message);
            }
        }

        // Show updated indexes
        console.log('\n=== UPDATED INDEXES ON coach_availability ===');
        const [newIndexes] = await connection.execute('SHOW INDEX FROM coach_availability');
        newIndexes.forEach(index => {
            console.log(`Key: ${index.Key_name}, Column: ${index.Column_name}, Unique: ${index.Non_unique === 0 ? 'YES' : 'NO'}`);
        });

        await connection.end();
        console.log('\nUnique constraint fix completed!');
        
    } catch (error) {
        console.error('Database error:', error.message);
    }
}

fixUniqueConstraint();
