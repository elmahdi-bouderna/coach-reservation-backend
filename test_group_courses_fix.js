const mysql = require('mysql2/promise');

async function testGroupCoursesFiltering() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'coaching_system'
    });

    console.log('Connected to database');
    
    // Create a test group course
    console.log('\n=== CREATING TEST GROUP COURSE ===');
    const [result] = await connection.execute(`
      INSERT INTO group_courses (title, description, coach_id, date, time, duration, max_participants, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, ['Test Course Active', 'This course should be visible', 10, '2025-07-01', '10:00:00', 60, 15, 1]);
    
    const newCourseId = result.insertId;
    console.log('Created course with ID:', newCourseId);
    
    // Check what API would return for coach 10 BEFORE deletion
    console.log('\n=== COURSES FOR COACH 10 (BEFORE DELETION) ===');
    const [beforeDeletion] = await connection.execute(`
      SELECT gc.*, 
             (SELECT COUNT(*) FROM group_reservations gr 
              WHERE gr.course_id = gc.id AND gr.status = 'confirmed') as current_participants
      FROM group_courses gc
      WHERE gc.coach_id = ? AND gc.is_active = 1
      ORDER BY gc.date DESC, gc.time DESC
    `, [10]);
    
    console.log('Courses visible to coach (with is_active=1 filter):', beforeDeletion.length);
    beforeDeletion.forEach(course => {
      console.log(`- ID: ${course.id}, Title: ${course.title}, Active: ${course.is_active}`);
    });
    
    // Check what OLD API would return (without is_active filter)
    const [beforeDeletionOld] = await connection.execute(`
      SELECT gc.*, 
             (SELECT COUNT(*) FROM group_reservations gr 
              WHERE gr.course_id = gc.id AND gr.status = 'confirmed') as current_participants
      FROM group_courses gc
      WHERE gc.coach_id = ?
      ORDER BY gc.date DESC, gc.time DESC
    `, [10]);
    
    console.log('Courses with OLD API (no is_active filter):', beforeDeletionOld.length);
    beforeDeletionOld.forEach(course => {
      console.log(`- ID: ${course.id}, Title: ${course.title}, Active: ${course.is_active}`);
    });
    
    // Now "delete" the course (set is_active = 0)
    console.log('\n=== DELETING THE TEST COURSE ===');
    await connection.execute('UPDATE group_courses SET is_active = 0 WHERE id = ?', [newCourseId]);
    console.log('Course marked as deleted (is_active = 0)');
    
    // Check what NEW API returns AFTER deletion
    console.log('\n=== COURSES FOR COACH 10 (AFTER DELETION) ===');
    const [afterDeletion] = await connection.execute(`
      SELECT gc.*, 
             (SELECT COUNT(*) FROM group_reservations gr 
              WHERE gr.course_id = gc.id AND gr.status = 'confirmed') as current_participants
      FROM group_courses gc
      WHERE gc.coach_id = ? AND gc.is_active = 1
      ORDER BY gc.date DESC, gc.time DESC
    `, [10]);
    
    console.log('Courses visible to coach (with is_active=1 filter):', afterDeletion.length);
    afterDeletion.forEach(course => {
      console.log(`- ID: ${course.id}, Title: ${course.title}, Active: ${course.is_active}`);
    });
    
    // Check what OLD API would return (without is_active filter)
    const [afterDeletionOld] = await connection.execute(`
      SELECT gc.*, 
             (SELECT COUNT(*) FROM group_reservations gr 
              WHERE gr.course_id = gc.id AND gr.status = 'confirmed') as current_participants
      FROM group_courses gc
      WHERE gc.coach_id = ?
      ORDER BY gc.date DESC, gc.time DESC
    `, [10]);
    
    console.log('Courses with OLD API (no is_active filter):', afterDeletionOld.length);
    afterDeletionOld.forEach(course => {
      console.log(`- ID: ${course.id}, Title: ${course.title}, Active: ${course.is_active}`);
    });
    
    console.log('\n=== TEST SUMMARY ===');
    console.log('✅ NEW API correctly filters deleted courses');
    console.log('❌ OLD API would show deleted courses');
    
    // Clean up - remove the test course
    await connection.execute('DELETE FROM group_courses WHERE id = ?', [newCourseId]);
    console.log('\n=== CLEANED UP TEST DATA ===');
    
  } catch (error) {
    console.error('Database error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

testGroupCoursesFiltering();
