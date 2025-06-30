const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyAdmin } = require('./auth');

// Protected route - Get all reservations (admin only)
router.get('/admin/reservations', verifyToken, verifyAdmin, async (req, res) => {
    try {        const [reservations] = await db.execute(`
            SELECT 
                r.id,
                r.full_name,
                r.age,
                r.gender,
                r.email,
                r.phone,
                r.goal,
                r.date,
                r.time,
                r.created_at,
                r.created_by,
                r.coach_id,
                r.status,
                r.cancelled_at,
                r.cancelled_by,
                r.user_id,
                c.name as coach_name,
                c.specialty
            FROM reservations r
            JOIN coaches c ON r.coach_id = c.id
            ORDER BY r.date DESC, r.time DESC
        `);
        
        res.json(reservations);
    } catch (error) {
        console.error('Error fetching admin reservations:', error);
        res.status(500).json({ error: 'Failed to fetch reservations' });
    }
});

// Protected route - Get all clients (admin only)
router.get('/admin/clients', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [clients] = await db.execute(`
            SELECT 
                id,
                matricule,
                username,
                email,
                role,
                points,
                solo_points,
                team_points,
                full_name,
                phone,
                age,
                gender,
                goal,
                created_at
            FROM users
            WHERE role = 'user'
            ORDER BY username
        `);
        
        res.json(clients);
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});

// Protected route - Create a new client (admin only)
router.post('/admin/clients', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { username, email, password, points, full_name, phone, age, gender, goal } = req.body;
        
        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email and password are required' });
        }
        
        // Hash password
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Generate matricule using the utility function
        const { generateMatricule } = require('../utils/matriculeGenerator');
        const matricule = generateMatricule();
        
        // Set up points values (for backward compatibility)
        const totalPoints = points || 0;
        const soloPoints = req.body.solo_points !== undefined ? req.body.solo_points : totalPoints;
        const teamPoints = req.body.team_points !== undefined ? req.body.team_points : 0;
        
        // Insert new client with additional fields
        const [result] = await db.execute(
            'INSERT INTO users (matricule, username, email, password, role, points, solo_points, team_points, full_name, phone, age, gender, goal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [matricule, username, email, hashedPassword, 'user', totalPoints, soloPoints, teamPoints, full_name || null, phone || null, age || null, gender || null, goal || null]
        );
        
        const newClient = {
            id: result.insertId,
            matricule,
            username,
            email,
            role: 'user',
            points: points || 0,
            solo_points: req.body.solo_points !== undefined ? req.body.solo_points : (points || 0),
            team_points: req.body.team_points !== undefined ? req.body.team_points : 0,
            full_name: full_name || null,
            phone: phone || null,
            age: age || null,
            gender: gender || null,
            goal: goal || null
        };
        
        res.status(201).json(newClient);
    } catch (error) {
        console.error('Error creating client:', error);
        
        // Check for duplicate entry error
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.message.includes('username')) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            if (error.message.includes('email')) {
                return res.status(400).json({ error: 'Email already exists' });
            }
            return res.status(400).json({ error: 'Duplicate entry' });
        }
        
        res.status(500).json({ error: 'Failed to create client' });
    }
});

// Protected route - Update client points (admin only)
// ROUTE MOVED TO admin-points.js which handles both solo and team points
// This route is kept commented for reference
/*
router.patch('/admin/clients/:id/points', verifyToken, verifyAdmin, async (req, res) => {
    // This route has been replaced by the implementation in admin-points.js
    // which properly handles both solo_points and team_points
});
*/

// Protected route - Delete a client (admin only)
router.delete('/admin/clients/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if client has any reservations
        const [reservations] = await db.execute('SELECT id FROM reservations WHERE user_id = ?', [id]);
        
        if (reservations.length > 0) {
            // Remove the foreign key constraint for this client first
            await db.execute('UPDATE reservations SET user_id = NULL WHERE user_id = ?', [id]);
        }
        
        // Now delete the user
        const [result] = await db.execute('DELETE FROM users WHERE id = ? AND role = "user"', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        
        res.json({ message: 'Client deleted successfully' });
    } catch (error) {
        console.error('Error deleting client:', error);
        res.status(500).json({ error: 'Failed to delete client: ' + error.message });
    }
});

// Protected route - Update a client (admin only)
router.put('/admin/clients/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email, password, points, solo_points, team_points, full_name, phone, age, gender, goal } = req.body;
        
        console.log('Updating client with ID:', id);
        console.log('Received client data:', req.body);
        
        // Validate input
        if (!username || !email) {
            console.log('Validation failed: Username or email missing');
            return res.status(400).json({ error: 'Username and email are required' });
        }
        
        // Check if client exists
        const [clientCheck] = await db.execute('SELECT id FROM users WHERE id = ? AND role = "user"', [id]);
        if (clientCheck.length === 0) {
            console.log(`Client with ID ${id} not found`);
            return res.status(404).json({ error: 'Client not found' });
        }
        
        // Process points values
        const calculatedSoloPoints = solo_points !== undefined ? Number(solo_points) : 0;
        const calculatedTeamPoints = team_points !== undefined ? Number(team_points) : 0;
        // For backwards compatibility, we still update the total points
        const calculatedTotalPoints = calculatedSoloPoints + calculatedTeamPoints;
        
        // Prepare update fields and values
        let updateQuery = 'UPDATE users SET username = ?, email = ?, points = ?, solo_points = ?, team_points = ?, full_name = ?, phone = ?, age = ?, gender = ?, goal = ?';
        let params = [
            username, 
            email, 
            calculatedTotalPoints, 
            calculatedSoloPoints,
            calculatedTeamPoints,
            full_name || null, 
            phone || null, 
            age !== undefined && age !== '' ? age : null, 
            gender || null, 
            goal || null
        ];
        
        console.log('Processed params for update:', {
            username,
            email,
            points: calculatedTotalPoints,
            solo_points: calculatedSoloPoints,
            team_points: calculatedTeamPoints,
            full_name: full_name || null,
            phone: phone || null,
            age: age !== undefined && age !== '' ? age : null,
            gender: gender || null,
            goal: goal || null
        });
        
        // Add password to update if provided
        if (password) {
            console.log('Password provided, hashing password for update');
            const bcrypt = require('bcrypt');
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery += ', password = ?';
            params.push(hashedPassword);
        }
        
        // Add WHERE clause
        updateQuery += ' WHERE id = ?';
        params.push(id);
        
        console.log('Final SQL query:', updateQuery);
        console.log('Final params (excluding password):', params.filter((p, i) => !password || i !== params.length - 2));
        
        // Execute update
        const [updateResult] = await db.execute(updateQuery, params);
        console.log('Update result:', updateResult);
        
        if (updateResult.affectedRows === 0) {
            console.log('Update affected 0 rows');
            return res.status(404).json({ error: 'Client update failed - no rows affected' });
        }
        
        // Get updated client
        const [updatedClient] = await db.execute(`
            SELECT 
                id, matricule, username, email, role, points,
                solo_points, team_points, full_name, phone, age, gender, goal, created_at
            FROM users
            WHERE id = ?
        `, [id]);
        
        if (updatedClient.length === 0) {
            console.log('Could not find the updated client record');
            return res.status(404).json({ error: 'Updated client not found' });
        }
        
        console.log('Updated client record:', updatedClient[0]);
        res.json(updatedClient[0]);
    } catch (error) {
        console.error('Error updating client:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Failed to update client: ' + error.message,
            details: error.stack
        });
    }
});

// Protected route - Delete a reservation (admin only)
router.delete('/admin/reservations/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // First get the reservation to check if it exists and to get user data
        const [reservations] = await db.execute(
            'SELECT r.id, r.user_id, r.coach_id, u.points as user_points FROM reservations r ' +
            'LEFT JOIN users u ON r.user_id = u.id ' +
            'WHERE r.id = ?',
            [id]
        );
        
        if (reservations.length === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }
        
        const reservation = reservations[0];
        
        // Start a transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();
        
        try {
            // Delete the reservation
            const [deleteResult] = await connection.execute(
                'DELETE FROM reservations WHERE id = ?',
                [id]
            );
            
            // If the user had points deducted for this reservation, refund them
            if (reservation.user_id) {
                // Only refund if the reservation was within the past hour (to prevent abuse)
                const [timeCheck] = await connection.execute(
                    'SELECT TIMESTAMPDIFF(MINUTE, created_at, NOW()) as minutes_ago FROM reservations WHERE id = ?', 
                    [id]
                );
                
                // If the reservation was created within the last hour, refund the points
                if (timeCheck.length > 0 && timeCheck[0].minutes_ago < 60) {
                    await connection.execute(
                        'UPDATE users SET points = points + 30 WHERE id = ?',
                        [reservation.user_id]
                    );
                    
                    // Send notification to user about refund
                    if (global.notifyUser) {
                        global.notifyUser(reservation.user_id, {
                            type: 'reservation_cancelled',
                            refunded: true,
                            points: 30,
                            timestamp: new Date().toISOString(),
                            message: 'Your reservation has been cancelled by an administrator. 30 points have been refunded to your account.'
                        });
                    }
                }
            }
            
            await connection.commit();
            res.json({ 
                success: true, 
                message: 'Reservation deleted successfully' 
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error deleting reservation:', error);
        res.status(500).json({ error: 'Failed to delete reservation' });
    }
});

// Protected route - Cancel a reservation (admin only)
router.post('/cancel/:id', verifyToken, verifyAdmin, async (req, res) => {
    console.log(`\n=== ADMIN CANCELLATION REQUEST FOR RESERVATION ID: ${req.params.id} ===`);
    
    // Get a connection from the pool for transaction
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const reservationId = req.params.id;
        const { refundPoints = true } = req.body;
        
        console.log(`Processing cancellation for reservation ${reservationId}, refund points: ${refundPoints}`);
        
        // First, get the reservation details
        const [reservationData] = await connection.execute(`
            SELECT r.*, ca.id as availability_id 
            FROM reservations r
            JOIN coach_availability ca ON r.coach_id = ca.coach_id AND r.date = ca.date AND r.time = ca.start_time
            WHERE r.id = ?
        `, [reservationId]);
        
        if (reservationData.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Reservation not found' });
        }
        
        const reservation = reservationData[0];
        console.log(`Found reservation for ${reservation.full_name} on ${reservation.date} at ${reservation.time}`);
        
        // Check if the reservation is in the past
        const now = new Date();
        const reservationDate = new Date(reservation.date);
        const [hours, minutes] = reservation.time.split(':').map(Number);
        reservationDate.setHours(hours, minutes, 0, 0);
        
        if (reservationDate < now) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ 
                error: 'Cannot cancel past reservations. The session has already occurred.'
            });
        }
        
        // Check if the slot is already free (should not happen, but let's be safe)
        const [availabilityCheck] = await connection.execute(`
            SELECT is_booked FROM coach_availability 
            WHERE id = ?
        `, [reservation.availability_id]);
        
        if (availabilityCheck.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Availability slot not found' });
        }
        
        if (availabilityCheck[0].is_booked !== 1) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ error: 'This time slot is not currently booked' });
        }
        
        // Mark the slot as available again
        await connection.execute(`
            UPDATE coach_availability 
            SET is_booked = 0 
            WHERE id = ?
        `, [reservation.availability_id]);
        
        console.log(`Marked availability slot ${reservation.availability_id} as available`);
        
        // If we need to refund points and there is a user associated with this reservation
        if (refundPoints && reservation.user_id) {
            // Refund the point to the user
            await connection.execute(`
                UPDATE users 
                SET points = points + 1 
                WHERE id = ?
            `, [reservation.user_id]);
            
            console.log(`Refunded 1 point to user ID: ${reservation.user_id}`);
            
            // Get updated points for response
            const [pointsResult] = await connection.execute('SELECT points FROM users WHERE id = ?', [reservation.user_id]);
            reservation.refunded_points = 1;
            reservation.updated_points = pointsResult[0].points;
        }
        
        // Mark the reservation as cancelled in the database
        await connection.execute(`
            UPDATE reservations 
            SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = 'admin' 
            WHERE id = ?
        `, [reservationId]);
        
        console.log(`Updated reservation ${reservationId} status to cancelled`);
        
        // Commit the transaction
        await connection.commit();
        connection.release();
        
        // Send success response
        res.json({ 
            message: 'Reservation cancelled successfully',
            reservation_id: reservationId,
            coach_id: reservation.coach_id,
            date: reservation.date,
            time: reservation.time,
            slot_id: reservation.availability_id,
            client_name: reservation.full_name,
            client_email: reservation.email,
            refunded_points: reservation.refunded_points || 0,
            updated_points: reservation.updated_points || null
        });
        
    } catch (error) {
        console.error('Error cancelling reservation:', error);
        
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('Error rolling back transaction:', rollbackError);
        }
        
        connection.release();
        
        res.status(500).json({ 
            error: 'Failed to cancel reservation',
            message: error.message
        });
    }
});

// Add a general users endpoint for admin pack assignment
router.get('/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [users] = await db.execute(`
            SELECT 
                id,
                matricule,
                username,
                email,
                role,
                points,
                solo_points,
                team_points,
                full_name,
                phone,
                age,
                gender,
                goal,
                created_at
            FROM users 
            WHERE role IN ('user', 'coach')
            ORDER BY created_at DESC
        `);
        
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

module.exports = router;
