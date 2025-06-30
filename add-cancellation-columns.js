const db = require('./config/database');

async function addColumns() {
  try {
    await db.execute(`
      ALTER TABLE reservations 
      ADD COLUMN cancelled_at DATETIME DEFAULT NULL, 
      ADD COLUMN cancelled_by ENUM('client', 'admin', 'system') DEFAULT NULL
    `);
    console.log('Added cancelled_at and cancelled_by columns successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to add columns:', error);
    process.exit(1);
  }
}

addColumns();
