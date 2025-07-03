const db = require('./config/database');

async function updateProductionDatabase() {
  try {
    const connection = await db.getConnection();
    console.log('Connected to database');

    // Check if reservation_id column already exists
    const [columns] = await connection.execute("SHOW COLUMNS FROM coach_availability LIKE 'reservation_id'");
    
    if (columns.length === 0) {
      console.log('Adding reservation_id column to coach_availability...');
      await connection.execute('ALTER TABLE coach_availability ADD COLUMN reservation_id INT NULL COMMENT "Links overlapping slots to the original reservation"');
      
      console.log('Adding foreign key constraint...');
      await connection.execute('ALTER TABLE coach_availability ADD FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL');
      
      console.log('Adding index for reservation_id...');
      await connection.execute('ALTER TABLE coach_availability ADD INDEX idx_reservation_id (reservation_id)');
      
      console.log('Database schema updated successfully!');
    } else {
      console.log('reservation_id column already exists');
    }

    // Remove deprecated columns if they exist
    try {
      const [clientNameColumn] = await connection.execute("SHOW COLUMNS FROM coach_availability LIKE 'client_name'");
      if (clientNameColumn.length > 0) {
        console.log('Removing deprecated client_name column...');
        await connection.execute('ALTER TABLE coach_availability DROP COLUMN client_name');
      }

      const [isDerivedBookingColumn] = await connection.execute("SHOW COLUMNS FROM coach_availability LIKE 'is_derived_booking'");
      if (isDerivedBookingColumn.length > 0) {
        console.log('Removing deprecated is_derived_booking column...');
        await connection.execute('ALTER TABLE coach_availability DROP COLUMN is_derived_booking');
      }
    } catch (error) {
      console.log('Note: Some deprecated columns may not exist, this is normal');
    }

    connection.release();
    console.log('Production database update completed!');
  } catch (error) {
    console.error('Error updating database:', error.message);
    process.exit(1);
  }
}

updateProductionDatabase();
