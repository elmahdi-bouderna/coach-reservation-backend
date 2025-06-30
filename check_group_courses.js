const mysql = require('mysql2/promise');

async function checkGroupCourses() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'coaching_system'
    });

    console.log('Connected to database');
    
    // Check all group courses and their status
    const [courses] = await connection.execute('SELECT * FROM group_courses ORDER BY created_at DESC');
    console.log('\n=== ALL GROUP COURSES IN DATABASE ===');
    console.log('Total courses:', courses.length);
    
    if (courses.length === 0) {
      console.log('No group courses found in database');
    } else {
      courses.forEach(course => {
        console.log(`ID: ${course.id}, Title: ${course.title}, Coach ID: ${course.coach_id}, Active: ${course.is_active}, Date: ${course.date}`);
      });
    }
    
    // Check if there are any deleted courses (is_active = 0)
    const [deletedCourses] = await connection.execute('SELECT * FROM group_courses WHERE is_active = 0');
    console.log('\n=== DELETED/INACTIVE COURSES ===');
    console.log('Deleted courses:', deletedCourses.length);
    
    if (deletedCourses.length > 0) {
      deletedCourses.forEach(course => {
        console.log(`ID: ${course.id}, Title: ${course.title}, Coach ID: ${course.coach_id}, Active: ${course.is_active}`);
      });
    }
    
    // Check active courses
    const [activeCourses] = await connection.execute('SELECT * FROM group_courses WHERE is_active = 1');
    console.log('\n=== ACTIVE COURSES ===');
    console.log('Active courses:', activeCourses.length);
    
    if (activeCourses.length > 0) {
      activeCourses.forEach(course => {
        console.log(`ID: ${course.id}, Title: ${course.title}, Coach ID: ${course.coach_id}, Active: ${course.is_active}`);
      });
    }
    
  } catch (error) {
    console.error('Database error:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkGroupCourses();
