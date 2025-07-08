const mysql = require('mysql2');

// Create connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'coaching_system'
});

// Connect to the database
db.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to database');
  
  // Insert sample time slots for today
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Get coaches first
  db.query('SELECT id, name FROM coaches LIMIT 3', (err, coaches) => {
    if (err) {
      console.error('Error fetching coaches:', err);
      return;
    }
    
    console.log('Found coaches:', coaches);
    
    if (coaches.length === 0) {
      console.log('No coaches found. Creating sample coaches...');
      
      // Insert sample coaches
      const insertCoaches = [
        ['Coach Test 1', 'coach1@test.com', '1234567890', 'Fitness'],
        ['Coach Test 2', 'coach2@test.com', '1234567891', 'Nutrition'],
        ['Coach Test 3', 'coach3@test.com', '1234567892', 'Wellness']
      ];
      
      insertCoaches.forEach((coach, index) => {
        db.query(
          'INSERT INTO coaches (name, email, phone, specialty) VALUES (?, ?, ?, ?)',
          coach,
          (err, result) => {
            if (err) {
              console.error('Error inserting coach:', err);
            } else {
              console.log(`Coach ${coach[0]} created with ID: ${result.insertId}`);
              
              // Create time slots for this coach
              const timeSlots = [
                [result.insertId, today, '09:00:00', '10:00:00', 1],
                [result.insertId, today, '10:00:00', '11:00:00', 1],
                [result.insertId, today, '14:00:00', '15:00:00', 1],
                [result.insertId, today, '15:00:00', '16:00:00', 1],
                [result.insertId, tomorrow, '09:00:00', '10:00:00', 1],
                [result.insertId, tomorrow, '10:00:00', '11:00:00', 1]
              ];
              
              timeSlots.forEach((slot, slotIndex) => {
                db.query(
                  'INSERT INTO time_slots (coach_id, date, start_time, end_time, is_available) VALUES (?, ?, ?, ?, ?)',
                  slot,
                  (err, slotResult) => {
                    if (err) {
                      console.error('Error inserting time slot:', err);
                    } else {
                      console.log(`Time slot created: ${slot[1]} ${slot[2]}-${slot[3]}`);
                    }
                  }
                );
              });
              
              // Create a sample reservation
              if (index === 0) {
                setTimeout(() => {
                  db.query(
                    'INSERT INTO reservations (coach_id, user_id, date, time, full_name, email, phone, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [result.insertId, 1, today, '09:00:00', 'Test Client', 'client@test.com', '1234567890', 'confirmed'],
                    (err, resResult) => {
                      if (err) {
                        console.error('Error creating reservation:', err);
                      } else {
                        console.log('Sample reservation created');
                      }
                    }
                  );
                }, 1000);
              }
            }
          }
        );
      });
    } else {
      // Coaches exist, just add time slots
      coaches.forEach((coach, index) => {
        const timeSlots = [
          [coach.id, today, '09:00:00', '10:00:00', 1],
          [coach.id, today, '10:00:00', '11:00:00', 1],
          [coach.id, today, '14:00:00', '15:00:00', 1],
          [coach.id, today, '15:00:00', '16:00:00', 1],
          [coach.id, tomorrow, '09:00:00', '10:00:00', 1],
          [coach.id, tomorrow, '10:00:00', '11:00:00', 1]
        ];
        
        timeSlots.forEach((slot) => {
          db.query(
            'INSERT IGNORE INTO time_slots (coach_id, date, start_time, end_time, is_available) VALUES (?, ?, ?, ?, ?)',
            slot,
            (err, slotResult) => {
              if (err) {
                console.error('Error inserting time slot:', err);
              } else {
                console.log(`Time slot created: ${coach.name} - ${slot[1]} ${slot[2]}-${slot[3]}`);
              }
            }
          );
        });
        
        // Create a sample reservation for first coach
        if (index === 0) {
          setTimeout(() => {
            db.query(
              'INSERT IGNORE INTO reservations (coach_id, user_id, date, time, full_name, email, phone, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [coach.id, 1, today, '09:00:00', 'Test Client', 'client@test.com', '1234567890', 'confirmed'],
              (err, resResult) => {
                if (err) {
                  console.error('Error creating reservation:', err);
                } else {
                  console.log('Sample reservation created for', coach.name);
                }
              }
            );
          }, 1000);
        }
      });
    }
    
    // Close connection after 5 seconds
    setTimeout(() => {
      db.end();
      console.log('Database connection closed');
    }, 5000);
  });
});
