// Script to apply the add_reservation_status.sql migration
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function runMigration() {
    try {
        console.log('Checking if reservation status migration is needed...');
        
        // Check if the status column already exists in the reservations table
        const [columns] = await db.execute(`SHOW COLUMNS FROM reservations LIKE 'status'`);
        
        if (columns.length > 0) {
            console.log('Migration already applied. The status column already exists in the reservations table.');
            return;
        }
        
        console.log('Status column not found. Applying migration...');
        
        // Read the SQL migration file
        const sqlPath = path.join(__dirname, '../../database/add_reservation_status.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Split the SQL into individual statements
        const statements = sql
            .split(';')
            .filter(statement => statement.trim().length > 0);
        
        // Execute each statement
        for (const statement of statements) {
            console.log(`Executing: ${statement.substring(0, 100)}...`);
            await db.execute(statement);
        }
        
        console.log('Migration completed successfully!');
        
        // Check if the migration worked by querying the new columns
        const [newColumns] = await db.execute(`SHOW COLUMNS FROM reservations LIKE 'status'`);
        console.log(`Status column now exists: ${newColumns.length > 0 ? 'Yes' : 'No'}`);
        
    } catch (error) {
        console.error('Error applying migration:', error);
    } finally {
        // Close the database connection
        await db.end();
    }
}

// Run the migration
runMigration();
