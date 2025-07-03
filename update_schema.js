const db = require('./config/database');

async function updateDatabase() {
  try {
    const connection = await db.getConnection();

    console.log('Connected to database');

    // Check if reservation_id column already exists
    const [columns] = await connection.execute("SHOW COLUMNS FROM coach_availability LIKE 'reservation_id'");
    
    if (columns.length === 0) {
      console.log('Adding reservation_id column...');
      await connection.execute('ALTER TABLE coach_availability ADD COLUMN reservation_id INT NULL COMMENT "Links overlapping slots to the original reservation"');
      
      console.log('Adding foreign key constraint...');
      await connection.execute('ALTER TABLE coach_availability ADD FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL');
      
      console.log('Adding index...');
      await connection.execute('ALTER TABLE coach_availability ADD INDEX idx_reservation_id (reservation_id)');
      
      console.log('Database schema updated successfully!');
    } else {
      console.log('reservation_id column already exists');
    }

    connection.release();
  } catch (error) {
    console.error('Error updating database:', error.message);
  }
}

updateDatabase();
