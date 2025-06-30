const db = require('./config/database');

(async () => { 
  try { 
    console.log('Checking database structure...');
    
    // Check tables
    const [tables] = await db.execute('SHOW TABLES');
    console.log('Tables in database:');
    tables.forEach(table => {
      console.log(Object.values(table)[0]);
    });
    
    // Check if group_reservations exists
    try {
      const [columns] = await db.execute('SHOW COLUMNS FROM group_reservations');
      console.log('\nColumns in group_reservations:');
      columns.forEach(col => {
        console.log(`${col.Field} (${col.Type})`);
      });
    } catch(err) {
      console.error('\nError with group_reservations table:', err.message);
    }
    
    // Check sample data
    try {
      const [count] = await db.execute('SELECT COUNT(*) as count FROM group_reservations');
      console.log(`\nTotal group_reservations: ${count[0].count}`);
      
      if (count[0].count > 0) {
        const [sample] = await db.execute('SELECT * FROM group_reservations LIMIT 5');
        console.log('\nSample data:');
        console.log(JSON.stringify(sample, null, 2));
      }
    } catch(err) {
      console.error('\nError querying group_reservations data:', err.message);
    }
    
  } catch(err) { 
    console.error('Database error:', err); 
  } finally { 
    process.exit(); 
  } 
})();
