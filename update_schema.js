const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateSchema() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT
    });

    try {
        console.log('Connected to database');
        
        // Check if session_type column exists
        const [columns] = await connection.execute(
            "SHOW COLUMNS FROM coach_availability LIKE 'session_type'"
        );
        
        if (columns.length === 0) {
            console.log('Adding session_type column to coach_availability...');
            await connection.execute(`
                ALTER TABLE coach_availability 
                ADD COLUMN session_type ENUM('normal', 'bilan') DEFAULT 'normal' COMMENT 'Type of session: normal (55 min) or bilan (30 min)'
            `);
        } else {
            console.log('session_type column already exists in coach_availability');
        }

        // Check if is_free column exists in coach_availability
        const [freeColumns] = await connection.execute(
            "SHOW COLUMNS FROM coach_availability LIKE 'is_free'"
        );
        
        if (freeColumns.length === 0) {
            console.log('Adding is_free column to coach_availability...');
            await connection.execute(`
                ALTER TABLE coach_availability 
                ADD COLUMN is_free BOOLEAN DEFAULT FALSE COMMENT 'Whether this slot is free (bilan sessions are free)'
            `);
        } else {
            console.log('is_free column already exists in coach_availability');
        }

        // Update existing records
        console.log('Updating existing coach_availability records...');
        await connection.execute(`
            UPDATE coach_availability 
            SET session_type = 'normal', 
                duration = 55,
                is_free = FALSE
            WHERE (session_type IS NULL OR session_type = 'normal') 
            AND (duration IS NULL OR duration = 55)
        `);

        // Check if session_type column exists in reservations
        const [resColumns] = await connection.execute(
            "SHOW COLUMNS FROM reservations LIKE 'session_type'"
        );
        
        if (resColumns.length === 0) {
            console.log('Adding session_type and is_free columns to reservations...');
            await connection.execute(`
                ALTER TABLE reservations 
                ADD COLUMN session_type ENUM('normal', 'bilan') DEFAULT 'normal' COMMENT 'Type of reservation: normal (55 min) or bilan (30 min)',
                ADD COLUMN is_free BOOLEAN DEFAULT FALSE COMMENT 'Whether this reservation is free (bilan sessions are free)'
            `);
        } else {
            console.log('session_type column already exists in reservations');
        }

        // Update existing reservations
        console.log('Updating existing reservation records...');
        await connection.execute(`
            UPDATE reservations 
            SET session_type = 'normal', 
                is_free = FALSE
            WHERE session_type IS NULL
        `);

        // Add indexes if they don't exist
        try {
            console.log('Adding indexes...');
            await connection.execute(`
                ALTER TABLE coach_availability 
                ADD INDEX idx_session_type (session_type, is_booked, date)
            `);
        } catch (err) {
            if (err.code === 'ER_DUP_KEYNAME') {
                console.log('Index idx_session_type already exists on coach_availability');
            } else {
                console.error('Error adding index to coach_availability:', err.message);
            }
        }

        try {
            await connection.execute(`
                ALTER TABLE reservations 
                ADD INDEX idx_session_type_res (session_type, status, date)
            `);
        } catch (err) {
            if (err.code === 'ER_DUP_KEYNAME') {
                console.log('Index idx_session_type_res already exists on reservations');
            } else {
                console.error('Error adding index to reservations:', err.message);
            }
        }

        console.log('Schema update completed successfully!');
        
    } catch (error) {
        console.error('Error updating schema:', error);
    } finally {
        await connection.end();
    }
}

updateSchema();
