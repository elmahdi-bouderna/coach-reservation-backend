require('dotenv').config();
const db = require('../config/database');

async function checkAndCreateTables() {
    try {
        console.log('🔍 Checking database tables...');
        
        // Check if packs table exists
        try {
            const [packsResult] = await db.execute('SELECT 1 FROM packs LIMIT 1');
            console.log('✅ Packs table exists');
        } catch (error) {
            if (error.errno === 1146) {
                console.log('❌ Packs table missing, creating...');
                await createPacksTable();
            } else {
                throw error;
            }
        }
        
        // Check if group_courses table exists
        try {
            const [coursesResult] = await db.execute('SELECT 1 FROM group_courses LIMIT 1');
            console.log('✅ Group courses table exists');
        } catch (error) {
            if (error.errno === 1146) {
                console.log('❌ Group courses table missing, creating...');
                await createGroupCoursesTable();
            } else {
                throw error;
            }
        }
        
        // Check if group_reservations table exists
        try {
            const [reservationsResult] = await db.execute('SELECT 1 FROM group_reservations LIMIT 1');
            console.log('✅ Group reservations table exists');
        } catch (error) {
            if (error.errno === 1146) {
                console.log('❌ Group reservations table missing, creating...');
                await createGroupReservationsTable();
            } else {
                throw error;
            }
        }
        
        // Check if user_packs table exists
        try {
            const [userPacksResult] = await db.execute('SELECT 1 FROM user_packs LIMIT 1');
            console.log('✅ User packs table exists');
        } catch (error) {
            if (error.errno === 1146) {
                console.log('❌ User packs table missing, creating...');
                await createUserPacksTable();
            } else {
                throw error;
            }
        }
        
        console.log('🎉 All required tables are present!');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error checking tables:', error);
        process.exit(1);
    }
}

async function createPacksTable() {
    const createPacksSQL = `
        CREATE TABLE IF NOT EXISTS packs (
            id int(11) NOT NULL AUTO_INCREMENT,
            name varchar(100) NOT NULL,
            description text DEFAULT NULL,
            points int(11) NOT NULL,
            solo_points int(11) DEFAULT 0,
            team_points int(11) DEFAULT 0,
            price decimal(10,2) DEFAULT NULL,
            created_at timestamp NOT NULL DEFAULT current_timestamp(),
            is_active tinyint(1) DEFAULT 1,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `;
    
    await db.execute(createPacksSQL);
    
    // Insert sample data
    const insertSamplePacks = `
        INSERT IGNORE INTO packs (name, description, points, solo_points, team_points, price, is_active) VALUES
        ('Starter Pack', 'Get started with 5 solo points + 5 team points', 10, 5, 5, 29.99, 1),
        ('Premium Pack', 'Get 15 solo points + 15 team points', 30, 15, 15, 89.99, 1),
        ('Ultimate Pack', 'Get 30 solo points + 30 team points', 60, 30, 30, 199.99, 1);
    `;
    
    await db.execute(insertSamplePacks);
    console.log('✅ Packs table created with sample data');
}

async function createGroupCoursesTable() {
    const createGroupCoursesSQL = `
        CREATE TABLE IF NOT EXISTS group_courses (
            id int(11) NOT NULL AUTO_INCREMENT,
            title varchar(200) NOT NULL,
            description text DEFAULT NULL,
            coach_id int(11) NOT NULL,
            date date NOT NULL,
            time time NOT NULL,
            duration int(11) DEFAULT 60,
            max_participants int(11) DEFAULT 10,
            created_at timestamp NOT NULL DEFAULT current_timestamp(),
            is_active tinyint(1) DEFAULT 1,
            PRIMARY KEY (id),
            KEY coach_id (coach_id),
            CONSTRAINT group_courses_coach_fk FOREIGN KEY (coach_id) REFERENCES coaches (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `;
    
    await db.execute(createGroupCoursesSQL);
    console.log('✅ Group courses table created');
}

async function createGroupReservationsTable() {
    const createGroupReservationsSQL = `
        CREATE TABLE IF NOT EXISTS group_reservations (
            id int(11) NOT NULL AUTO_INCREMENT,
            course_id int(11) NOT NULL,
            user_id int(11) NOT NULL,
            status enum('confirmed','cancelled') DEFAULT 'confirmed',
            created_at timestamp NOT NULL DEFAULT current_timestamp(),
            cancelled_at timestamp NULL DEFAULT NULL,
            cancelled_by varchar(50) DEFAULT NULL,
            PRIMARY KEY (id),
            KEY course_id (course_id),
            KEY user_id (user_id),
            CONSTRAINT group_reservations_course_fk FOREIGN KEY (course_id) REFERENCES group_courses (id) ON DELETE CASCADE,
            CONSTRAINT group_reservations_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `;
    
    await db.execute(createGroupReservationsSQL);
    console.log('✅ Group reservations table created');
}

async function createUserPacksTable() {
    const createUserPacksSQL = `
        CREATE TABLE IF NOT EXISTS user_packs (
            id int(11) NOT NULL AUTO_INCREMENT,
            user_id int(11) NOT NULL,
            pack_id int(11) NOT NULL,
            purchased_at timestamp NOT NULL DEFAULT current_timestamp(),
            payment_status enum('pending','completed','failed') DEFAULT 'pending',
            payment_reference varchar(100) DEFAULT NULL,
            PRIMARY KEY (id),
            KEY user_id (user_id),
            KEY pack_id (pack_id),
            CONSTRAINT user_packs_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            CONSTRAINT user_packs_pack_fk FOREIGN KEY (pack_id) REFERENCES packs (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `;
    
    await db.execute(createUserPacksSQL);
    console.log('✅ User packs table created');
}

// Run the check
checkAndCreateTables();
