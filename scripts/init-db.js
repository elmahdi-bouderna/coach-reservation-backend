const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Database connection configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true
};

async function initializeDatabase() {
  let connection;

  try {
    // Connect to MySQL server without specifying a database
    connection = await mysql.createConnection(dbConfig);
    
    console.log('Connected to MySQL server');
    
    // Create database if it doesn't exist
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'coach_reservation'}`);
    
    console.log(`Database "${process.env.DB_NAME || 'coach_reservation'}" created or already exists`);
    
    // Switch to the database
    await connection.query(`USE ${process.env.DB_NAME || 'coach_reservation'}`);
    
    // Read and execute schema.sql
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await connection.query(schemaSql);
    
    console.log('Schema created successfully');
    
    // Check if users table exists and has any records
    const [userRows] = await connection.query('SELECT COUNT(*) as count FROM users');
    
    if (userRows[0].count === 0) {
      // Read and execute users.sql
      const usersPath = path.join(__dirname, '..', 'database', 'users.sql');
      const usersSql = fs.readFileSync(usersPath, 'utf8');
      await connection.query(usersSql);
      
      console.log('Admin user created successfully');
    } else {
      console.log('Admin user already exists');
    }
    
    // Read and execute sample_data.sql (if in development mode)
    if (process.env.NODE_ENV === 'development') {
      const [dataRows] = await connection.query('SELECT COUNT(*) as count FROM coaches');
      
      if (dataRows[0].count === 0) {
        const sampleDataPath = path.join(__dirname, '..', 'database', 'sample_data.sql');
        const sampleDataSql = fs.readFileSync(sampleDataPath, 'utf8');
        await connection.query(sampleDataSql);
        
        console.log('Sample data loaded successfully');
      } else {
        console.log('Sample data already exists');
      }
    }
    
    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

// Run the initialization function
initializeDatabase();
