const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Secret key for JWT from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Login route
router.post('/login', async (req, res) => {
    try {
        console.log('Login attempt:', req.body);
        const { matricule, password } = req.body;
        
        // Validate input
        if (!matricule || !password) {
            console.log('Missing credentials:', { matricule: !!matricule, password: !!password });
            return res.status(400).json({ error: 'Matricule and password are required' });
        }
        
        // Check if user exists
        console.log('Searching for user with matricule:', matricule);
        const [users] = await db.execute('SELECT * FROM users WHERE matricule = ?', [matricule]);
        
        if (users.length === 0) {
            console.log('No user found with matricule:', matricule);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = users[0];
        console.log('User found:', { id: user.id, matricule: user.matricule, role: user.role });
        
        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            console.log('Password validation failed for user:', user.id);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        console.log('Password validated successfully for user:', user.id);
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id, 
                username: user.username,
                matricule: user.matricule,
                role: user.role 
            }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );
        
        // Return user info and token
        console.log('Login successful for user:', user.id);
        res.json({
            userId: user.id,
            username: user.username,
            matricule: user.matricule,
            role: user.role,
            points: user.points || 0,
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// Client login route (using email instead of matricule)
router.post('/client-login', async (req, res) => {
    try {
        console.log('Client login attempt:', req.body);
        const { email, password } = req.body;
        
        // Validate input
        if (!email || !password) {
            console.log('Missing credentials:', { email: !!email, password: !!password });
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        // Check if user exists
        console.log('Searching for client with email:', email);
        const [users] = await db.execute('SELECT * FROM users WHERE email = ? AND role = "user"', [email]);
        
        if (users.length === 0) {
            console.log('No client found with email:', email);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = users[0];
        console.log('Client found:', { id: user.id, email: user.email, role: user.role });
        
        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            console.log('Password validation failed for client:', user.id);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        console.log('Password validated successfully for client:', user.id);
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id, 
                username: user.username,
                email: user.email,
                matricule: user.matricule,
                role: user.role 
            }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );
        
        // Return user info and token
        console.log('Login successful for client:', user.id);
        res.json({
            userId: user.id,
            username: user.username,
            email: user.email,
            matricule: user.matricule,
            role: user.role,
            points: user.points || 0,
            solo_points: user.solo_points || 0,
            team_points: user.team_points || 0,
            full_name: user.full_name,
            phone: user.phone,
            age: user.age,
            gender: user.gender,
            goal: user.goal,
            token
        });
    } catch (error) {
        console.error('Client login error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// Coach login route (using matricule like admin)
router.post('/coach-login', async (req, res) => {
    try {
        console.log('Coach login attempt:', req.body);
        const { matricule, password } = req.body;
        
        // Validate input
        if (!matricule || !password) {
            console.log('Missing credentials:', { matricule: !!matricule, password: !!password });
            return res.status(400).json({ error: 'Matricule and password are required' });
        }
        
        // Check if coach user exists
        console.log('Searching for coach with matricule:', matricule);
        const [users] = await db.execute(
            'SELECT u.*, c.id as coach_id, c.specialty, c.bio, c.photo FROM users u ' +
            'INNER JOIN coaches c ON u.id = c.user_id ' +
            'WHERE u.matricule = ? AND u.role = "coach"', 
            [matricule]
        );
        
        if (users.length === 0) {
            console.log('No coach found with matricule:', matricule);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = users[0];
        console.log('Coach found:', { id: user.id, matricule: user.matricule });
        
        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            console.log('Password validation failed for coach:', user.id);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        console.log('Password validated successfully for coach:', user.id);
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id,
                coachId: user.coach_id,
                username: user.username,
                matricule: user.matricule,
                role: user.role 
            }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );
        
        // Return coach info and token
        console.log('Login successful for coach:', user.id);
        res.json({
            userId: user.id,
            coachId: user.coach_id,
            username: user.username,
            matricule: user.matricule,
            email: user.email,
            specialty: user.specialty,
            bio: user.bio,
            photo: user.photo,
            role: user.role,
            token
        });
    } catch (error) {
        console.error('Coach login error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// Register new user
router.post('/register', async (req, res) => {
    try {
        console.log('Registration attempt:', req.body);
        const { 
            username, 
            email, 
            password, 
            full_name, 
            phone, 
            age, 
            gender, 
            goal 
        } = req.body;
        
        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email and password are required' });
        }
        
        // Check if user exists
        const [existingUsers] = await db.execute(
            'SELECT * FROM users WHERE email = ? OR username = ?', 
            [email, username]
        );
        
        if (existingUsers.length > 0) {
            const isDuplicateEmail = existingUsers.some(user => user.email === email);
            const isDuplicateUsername = existingUsers.some(user => user.username === username);
            
            if (isDuplicateEmail && isDuplicateUsername) {
                return res.status(400).json({ error: 'Both email and username are already in use' });
            } else if (isDuplicateEmail) {
                return res.status(400).json({ error: 'Email is already in use' });
            } else {
                return res.status(400).json({ error: 'Username is already in use' });
            }
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Generate matricule using the utility function
        const { generateMatricule } = require('../utils/matriculeGenerator');
        const matricule = generateMatricule();
        
        // Insert new user with profile information
        const [result] = await db.execute(
            `INSERT INTO users 
            (matricule, username, password, email, role, full_name, phone, age, gender, goal, points) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                matricule, 
                username, 
                hashedPassword, 
                email, 
                'user', 
                full_name, 
                phone, 
                age || null, 
                gender, 
                goal, 
                0 // Initial points
            ]
        );
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: result.insertId, 
                username,
                email,
                matricule,
                role: 'user' 
            }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );
        
        // Return user info and token
        const user = {
            id: result.insertId,
            username,
            email,
            matricule,
            role: 'user',
            full_name,
            points: 0
        };
        
        console.log('Registration successful for user:', user.id);
        res.status(201).json({
            message: 'Registration successful',
            user,
            token
        });
    } catch (error) {        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed: ' + error.message });
    }
});

// Verify token middleware
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        console.log('No token provided');
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // Normalize the user object to have both id and userId for compatibility
        req.user = {
            ...decoded,
            id: decoded.userId || decoded.id // Ensure id is available
        };
        
        console.log('Token verified successfully:', {
            userId: req.user.id,
            role: req.user.role,
            path: req.path
        });
        
        next();
    } catch (error) {
        console.error('Token verification failed:', error.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// Verify admin role middleware
const verifyAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ error: 'Admin access required' });
    }
};

// Get current user route (protected)
router.get('/me', verifyToken, async (req, res) => {
    try {
        const [users] = await db.execute('SELECT id, matricule, username, email, role FROM users WHERE id = ?', [req.user.userId]);
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(users[0]);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user information' });
    }
});

// Coach login route (using matricule like admin)
router.post('/coach-login', async (req, res) => {
    try {
        console.log('Coach login attempt:', req.body);
        const { matricule, password } = req.body;
        
        // Validate input
        if (!matricule || !password) {
            console.log('Missing credentials:', { matricule: !!matricule, password: !!password });
            return res.status(400).json({ error: 'Matricule and password are required' });
        }
        
        // Check if coach user exists
        console.log('Searching for coach with matricule:', matricule);
        const [users] = await db.execute(
            'SELECT u.*, c.id as coach_id, c.specialty, c.bio, c.photo FROM users u ' +
            'INNER JOIN coaches c ON u.id = c.user_id ' +
            'WHERE u.matricule = ? AND u.role = "coach"', 
            [matricule]
        );
        
        if (users.length === 0) {
            console.log('No coach found with matricule:', matricule);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = users[0];
        console.log('Coach found:', { id: user.id, matricule: user.matricule });
        
        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            console.log('Password validation failed for coach:', user.id);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        console.log('Password validated successfully for coach:', user.id);
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id,
                coachId: user.coach_id,
                username: user.username,
                matricule: user.matricule,
                role: user.role 
            }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );
        
        // Return coach info and token
        console.log('Login successful for coach:', user.id);
        res.json({
            userId: user.id,
            coachId: user.coach_id,
            username: user.username,
            matricule: user.matricule,
            email: user.email,
            specialty: user.specialty,
            bio: user.bio,
            photo: user.photo,
            role: user.role,
            token
        });
    } catch (error) {
        console.error('Coach login error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// Verify coach role middleware
const verifyCoach = (req, res, next) => {
    if (!req.user) {
        console.log('No user object in request for coach verification');
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (req.user.role === 'coach') {
        console.log('Coach role verified for user:', req.user.id);
        next();
    } else {
        console.log('Coach access denied for user with role:', req.user.role);
        return res.status(403).json({ error: 'Coach access required' });
    }
};

// Export both the router and middlewares
module.exports = {
    router,
    verifyToken,
    verifyAdmin,
    verifyCoach
};
