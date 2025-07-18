const db = require('./config/database');
const bcrypt = require('bcrypt');

async function createAdminUser() {
    try {
        // Check if admin user already exists
        const [existingUsers] = await db.execute('SELECT * FROM users WHERE role = ?', ['admin']);
        
        if (existingUsers.length > 0) {
            console.log('Admin user already exists:', existingUsers[0]);
            return;
        }
        
        // Create admin user
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        await db.execute(
            'INSERT INTO users (matricule, username, password, email, role) VALUES (?, ?, ?, ?, ?)',
            ['ADMIN001', 'admin', hashedPassword, 'admin@example.com', 'admin']
        );
        
        console.log('Admin user created successfully!');
        console.log('Login credentials:');
        console.log('Username: admin');
        console.log('Password: admin123');
        
    } catch (error) {
        console.error('Error creating admin user:', error);
    } finally {
        await db.end();
    }
}

createAdminUser();
