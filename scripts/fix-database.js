const mysql = require('mysql2/promise');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function runScript() {
  console.log('Starting database update...');
  
  try {
    // Create connection
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'coaching_system',
      multipleStatements: true // Important for running multiple SQL statements
    });
    
    console.log('Connected to database');
      // Read SQL file
    const sqlPath = path.join(__dirname, '..', '..', 'database', 'fix_missing_fields.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Executing SQL to fix missing fields...');
    
    // Execute SQL
    await connection.query(sql);
    
    console.log('Database update completed successfully!');
    
    // Close connection
    await connection.end();
    
  } catch (error) {
    console.error('Error updating database:', error);
    process.exit(1);
  }
}

runScript();
