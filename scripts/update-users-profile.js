const mysql = require('mysql2/promise');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function runSqlScript() {
  console.log('Updating users table with profile fields...');
  
  try {
    // Read SQL file
    const sqlFile = path.join(__dirname, '..', 'database', 'update_users_profile.sql');
    const sqlScript = fs.readFileSync(sqlFile, 'utf8');
    const sqlStatements = sqlScript.split(';').filter(stmt => stmt.trim());
    
    // Create database connection
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'coaching_system',
      multipleStatements: true
    });
    
    console.log('Connected to database successfully');
    
    // Execute each SQL statement
    for (const statement of sqlStatements) {
      if (statement.trim()) {
        await connection.execute(statement + ';');
        console.log('Executed SQL statement successfully');
      }
    }
    
    console.log('Users table updated successfully with profile fields');
    await connection.end();
    
  } catch (error) {
    console.error('Error updating database:', error);
    process.exit(1);
  }
}

runSqlScript();
