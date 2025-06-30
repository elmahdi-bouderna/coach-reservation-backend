const mysql = require('mysql2/promise');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function runSqlScript() {
  console.log('Adding points column to users table and creating sample client users...');
  
  try {
    // Read SQL file
    const sqlFile = path.join(__dirname, '..', 'database', 'add_user_points.sql');
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
    
    console.log('Points column added and sample users created successfully');
    await connection.end();
    
  } catch (error) {
    console.error('Error updating database:', error);
    process.exit(1);
  }
}

runSqlScript();
