const db = require('./config/database');

async function createPacksTables() {
    try {
        console.log('Creating packs tables...');
        
        // Create packs table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS packs (
                id int(11) NOT NULL AUTO_INCREMENT,
                name varchar(100) NOT NULL,
                description text DEFAULT NULL,
                points int(11) NOT NULL,
                price decimal(10,2) DEFAULT NULL,
                created_at timestamp NOT NULL DEFAULT current_timestamp(),
                is_active tinyint(1) DEFAULT 1,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
        `);
        console.log('Packs table created successfully');
        
        // Create user_packs table
        await db.execute(`
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
                CONSTRAINT user_packs_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                CONSTRAINT user_packs_ibfk_2 FOREIGN KEY (pack_id) REFERENCES packs (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
        `);
        console.log('User_packs table created successfully');
        
        // Insert sample data
        const [existing] = await db.execute('SELECT COUNT(*) as count FROM packs');
        if (existing[0].count === 0) {
            await db.execute(`
                INSERT INTO packs (name, description, points, price, is_active) VALUES
                ('Starter Pack', 'Get started with 300 points for one session', 300, 29.99, 1),
                ('Premium Pack', 'Get 1000 points for multiple sessions', 1000, 89.99, 1),
                ('Ultimate Pack', 'Get 2500 points for a complete coaching experience', 2500, 199.99, 1)
            `);
            console.log('Sample pack data inserted successfully');
        } else {
            console.log('Sample pack data already exists');
        }
        
        console.log('✅ Packs system setup completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error setting up packs system:', error);
        process.exit(1);
    }
}

createPacksTables();
