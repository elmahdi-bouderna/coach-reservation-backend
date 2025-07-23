const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { verifyToken, verifyAdmin } = require('./auth');
const { markOverlappingSlots, freeOverlappingSlots } = require('../utils/availabilityHelpers');
const { asyncHandler } = require('../middleware/databaseErrorHandler');
const { sendBulkReservationConfirmation, sendBulkCoachNotification } = require('../utils/emailService');

// Protected route - Get all reservations (admin only)
router.get('/admin/reservations', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
    const [reservations] = await db.execute(`
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
            r.session_type,
            r.is_free,
            c.name as coach_name,
            c.specialty
        FROM reservations r
        JOIN coaches c ON r.coach_id = c.id
        ORDER BY r.date DESC, r.time DESC
    `);
    
    res.json(reservations);
}));

// Protected route - Get all clients (admin only)
router.get('/admin/clients', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
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
}));// Protected route - Create a new client (admin only)
router.post('/admin/clients', verifyToken, verifyAdmin, asyncHandler(async (req, res) => {
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
}));

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

        // Get the time slot details to free overlapping slots
        const [slotDetails] = await connection.execute(`
            SELECT start_time, end_time FROM coach_availability 
            WHERE id = ?
        `, [reservation.availability_id]);

        if (slotDetails.length > 0) {
            // Mark all overlapping slots as available
            const freedSlotsCount = await freeOverlappingSlots(
                connection,
                reservation.coach_id,
                reservation.date,
                slotDetails[0].start_time,
                slotDetails[0].end_time,
                true // this is the admin cancellation endpoint
            );
            
            console.log(`Freed ${freedSlotsCount} overlapping availability slots`);
        }
        
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

// Admin route - Get all clients with their bilan information
router.get('/admin/clients-with-bilans', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [clients] = await db.execute(`
            SELECT 
                u.id,
                u.matricule,
                u.username,
                u.email,
                u.role,
                u.points,
                u.solo_points,
                u.team_points,
                u.full_name,
                u.phone,
                u.age,
                u.gender,
                u.goal,
                u.created_at,
                COUNT(DISTINCT r.id) as total_reservations,
                COUNT(DISTINCT cb.id) as total_bilans,
                GROUP_CONCAT(
                    DISTINCT CONCAT(
                        c.name, ':', 
                        COALESCE(cb.bilan, 'No bilan'), ':', 
                        COALESCE(cb.updated_at, cb.created_at, 'Never')
                    ) 
                    SEPARATOR '|||'
                ) as coach_bilans
            FROM users u
            LEFT JOIN reservations r ON u.id = r.user_id
            LEFT JOIN client_bilans cb ON u.id = cb.client_id
            LEFT JOIN coaches c ON cb.coach_id = c.id
            WHERE u.role = 'user'
            GROUP BY u.id, u.matricule, u.username, u.email, u.role, u.points, u.solo_points, u.team_points, u.full_name, u.phone, u.age, u.gender, u.goal, u.created_at
            ORDER BY u.created_at DESC
        `);
        
        // Process the coach_bilans data to make it more usable
        const processedClients = clients.map(client => {
            const bilans = [];
            if (client.coach_bilans) {
                const bilanParts = client.coach_bilans.split('|||');
                bilanParts.forEach(part => {
                    const [coachName, bilanText, updatedAt] = part.split(':');
                    if (coachName && bilanText !== 'No bilan') {
                        bilans.push({
                            coach_name: coachName,
                            bilan: bilanText,
                            updated_at: updatedAt !== 'Never' ? updatedAt : null
                        });
                    }
                });
            }
            
            return {
                ...client,
                bilans: bilans,
                coach_bilans: undefined // Remove the raw data
            };
        });
        
        res.json(processedClients);
    } catch (error) {
        console.error('Error fetching clients with bilans:', error);
        res.status(500).json({ error: 'Failed to fetch clients with bilans' });
    }
});

// Admin route - Get all coaches for bilan assignment
router.get('/admin/coaches-list', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [coaches] = await db.execute(`
            SELECT 
                c.id,
                c.name,
                c.specialty,
                u.email
            FROM coaches c
            JOIN users u ON c.user_id = u.id
            WHERE u.role = 'coach'
            ORDER BY c.name ASC
        `);
        
        res.json(coaches);
    } catch (error) {
        console.error('Error fetching coaches list:', error);
        res.status(500).json({ error: 'Failed to fetch coaches' });
    }
});

// Admin route - Add/Update client bilan for a specific coach
router.post('/admin/clients/:clientId/bilan/:coachId', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const clientId = req.params.clientId;
        const coachId = req.params.coachId;
        const { bilan } = req.body;
        
        if (!bilan || bilan.trim() === '') {
            return res.status(400).json({ error: 'Bilan content is required' });
        }
        
        // Verify that the client and coach exist
        const [client] = await db.execute('SELECT id FROM users WHERE id = ? AND role = "user"', [clientId]);
        const [coach] = await db.execute('SELECT id FROM coaches WHERE id = ?', [coachId]);
        
        if (client.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        
        if (coach.length === 0) {
            return res.status(404).json({ error: 'Coach not found' });
        }
        
        // Check if bilan already exists
        const [existingBilan] = await db.execute(
            'SELECT * FROM client_bilans WHERE coach_id = ? AND client_id = ?',
            [coachId, clientId]
        );
        
        if (existingBilan.length > 0) {
            // Update existing bilan
            await db.execute(
                'UPDATE client_bilans SET bilan = ?, updated_at = NOW() WHERE coach_id = ? AND client_id = ?',
                [bilan.trim(), coachId, clientId]
            );
            
            res.json({ 
                message: 'Bilan updated successfully',
                client_id: clientId,
                coach_id: coachId,
                bilan: bilan.trim(),
                updated_at: new Date()
            });
        } else {
            // Create new bilan
            const [result] = await db.execute(
                'INSERT INTO client_bilans (coach_id, client_id, bilan) VALUES (?, ?, ?)',
                [coachId, clientId, bilan.trim()]
            );
            
            res.status(201).json({ 
                message: 'Bilan created successfully',
                bilan_id: result.insertId,
                client_id: clientId,
                coach_id: coachId,
                bilan: bilan.trim(),
                created_at: new Date()
            });
        }
        
    } catch (error) {
        console.error('Error adding/updating client bilan:', error);
        res.status(500).json({ error: 'Failed to save bilan' });
    }
});

// Admin route - Delete client bilan
router.delete('/admin/clients/:clientId/bilan/:coachId', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const clientId = req.params.clientId;
        const coachId = req.params.coachId;
        
        // Delete the bilan
        const [result] = await db.execute(
            'DELETE FROM client_bilans WHERE coach_id = ? AND client_id = ?',
            [coachId, clientId]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Bilan not found' });
        }
        
        res.json({ 
            message: 'Bilan deleted successfully',
            client_id: clientId,
            coach_id: coachId
        });
        
    } catch (error) {
        console.error('Error deleting client bilan:', error);
        res.status(500).json({ error: 'Failed to delete bilan' });
    }
});

// Protected route - Get availability for planning view (admin only)
router.get('/admin/planning/availability', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        console.log('Fetching availability for dates:', start_date, 'to', end_date);
        
        // First get all coaches to ensure we return data for all coaches
        const [coaches] = await db.execute(`
            SELECT 
                id,
                name,
                specialty,
                photo as profile_image,
                email,
                bio
            FROM coaches
            ORDER BY name
        `);
        
        let query = `
            SELECT 
                ca.id,
                ca.coach_id,
                DATE_FORMAT(ca.date, '%Y-%m-%d') as date,
                TIME_FORMAT(ca.start_time, '%H:%i') as start_time,
                TIME_FORMAT(ca.end_time, '%H:%i') as end_time,
                CASE WHEN ca.is_booked = 1 THEN 0 ELSE 1 END as is_available,
                c.name as coach_name,
                c.photo as profile_image,
                c.specialty
            FROM coach_availability ca
            JOIN coaches c ON ca.coach_id = c.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (start_date && end_date) {
            query += ` AND ca.date BETWEEN ? AND ?`;
            params.push(start_date, end_date);
        }
        
        query += ` ORDER BY c.name, ca.date, ca.start_time`;
        
        const [availability] = await db.execute(query, params);
        
        console.log(`Found ${availability.length} availability slots for date range ${start_date} to ${end_date}`);
        
        // If there's no data, return empty array with clear message
        if (availability.length === 0) {
            console.log('No availability data found for the selected date range');
        }
        
        res.json(availability);
    } catch (error) {
        console.error('Error fetching planning availability:', error);
        res.status(500).json({ error: 'Failed to fetch availability', details: error.message });
    }
});

// Protected route - Get reservations for planning view (admin only)
router.get('/admin/planning/reservations', async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        console.log('Fetching reservations for dates:', start_date, 'to', end_date);
        
        let query = `
            SELECT 
                r.id,
                r.coach_id,
                DATE_FORMAT(r.date, '%Y-%m-%d') as date,
                TIME_FORMAT(r.time, '%H:%i') as time,
                r.status,
                r.full_name as client_name,
                r.email as client_email,
                r.phone as client_phone,
                r.session_type,
                r.is_free,
                r.created_at,
                c.name as coach_name,
                c.photo as profile_image,
                ca.id as availability_id,
                TIME_FORMAT(ca.start_time, '%H:%i') as start_time,
                TIME_FORMAT(ca.end_time, '%H:%i') as end_time
            FROM reservations r
            JOIN coaches c ON r.coach_id = c.id
            LEFT JOIN coach_availability ca ON ca.coach_id = r.coach_id 
                AND DATE(ca.date) = DATE(r.date) 
                AND TIME(ca.start_time) = TIME(r.time)
            WHERE r.status IN ('confirmed', 'pending')
        `;
        
        const params = [];
        
        if (start_date && end_date) {
            query += ` AND r.date BETWEEN ? AND ?`;
            params.push(start_date, end_date);
        }
        
        query += ` ORDER BY c.name, r.date, r.time`;
        
        const [reservations] = await db.execute(query, params);
        
        console.log(`Found ${reservations.length} reservations for date range ${start_date} to ${end_date}`);
        
        // If there's no data, return empty array with clear message
        if (reservations.length === 0) {
            console.log('No reservation data found for the selected date range');
        }
        
        res.json(reservations);
    } catch (error) {
        console.error('Error fetching planning reservations:', error);
        res.status(500).json({ error: 'Failed to fetch reservations', details: error.message });
    }
});

// Get all coaches for the planning view
router.get('/coaches', async (req, res) => {
    try {
        console.log('Fetching all coaches');
        
        const [coaches] = await db.execute(`
            SELECT 
                id,
                name,
                specialty,
                photo,
                email,
                bio
            FROM coaches
            ORDER BY name
        `);
        
        // Map the results to include both photo and profile_image for compatibility
        const mappedCoaches = coaches.map(coach => ({
            ...coach,
            profile_image: coach.photo // Ensure profile_image is available
        }));
        
        console.log(`Found ${mappedCoaches.length} coaches`);
        console.log('Coaches data:', mappedCoaches);
        res.json(mappedCoaches);
    } catch (error) {
        console.error('Error fetching coaches:', error);
        res.status(500).json({ error: 'Failed to fetch coaches' });
    }
});

// Bulk create reservations for a client
router.post('/admin/bulk-reservations', verifyToken, verifyAdmin, async (req, res) => {
    console.log('=== BULK RESERVATION CREATION REQUEST ===');
    console.log('Request body:', req.body);
    
    const connection = await db.getConnection();
    
    try {
        const { 
            client_id, 
            coach_id, 
            start_date, 
            end_date, 
            time_slot, 
            days_of_week, 
            repeat_for_weeks 
        } = req.body;
        
        // Validate required fields
        if (!client_id || !coach_id || !start_date || !end_date || !time_slot || !days_of_week || days_of_week.length === 0) {
            connection.release();
            return res.status(400).json({ 
                error: 'Client ID, coach ID, date range, time slot, and days of week are required' 
            });
        }
        
        // Validate that end_date is after start_date
        if (new Date(end_date) < new Date(start_date)) {
            connection.release();
            return res.status(400).json({ 
                error: 'End date must be after start date' 
            });
        }
        
        // Check if dates are in the past
        const now = new Date();
        const currentDateStr = now.toISOString().split('T')[0];
        
        if (start_date < currentDateStr) {
            connection.release();
            return res.status(400).json({ 
                error: 'Cannot create reservations in the past. Please select future dates.'
            });
        }

        await connection.beginTransaction();

        // Get client details and check points
        const [clientData] = await connection.execute(`
            SELECT full_name, email, phone, age, gender, goal, points, solo_points, team_points 
            FROM users WHERE id = ?
        `, [client_id]);
        
        if (clientData.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Client not found' });
        }
        
        const client = clientData[0];
        
        // Get coach details
        const [coachData] = await connection.execute(`
            SELECT name, email FROM coaches WHERE id = ?
        `, [coach_id]);
        
        if (coachData.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ error: 'Coach not found' });
        }
        
        const coach = coachData[0];

        const createdReservations = [];
        const skippedSlots = [];
        let clientPoints = client.solo_points;
        
        // Calculate the end date based on repeat_for_weeks
        const startDateObj = new Date(start_date);
        const endDateObj = new Date(end_date);
        const finalEndDate = new Date(startDateObj);
        finalEndDate.setDate(finalEndDate.getDate() + (repeat_for_weeks * 7));
        
        // Use the smaller of the provided end_date or calculated final end date
        const actualEndDate = endDateObj < finalEndDate ? endDateObj : finalEndDate;
        
        // Iterate through each day in the date range
        let iterationDate = new Date(startDateObj);
        
        while (iterationDate <= actualEndDate) {
            const dayOfWeek = iterationDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
            
            // Check if this day is in our selected days_of_week
            if (days_of_week.includes(dayOfWeek)) {
                const dateStr = iterationDate.toISOString().split('T')[0];
                
                // Skip if this date is in the past
                if (dateStr >= currentDateStr) {
                    // Check if client has enough solo points
                    if (clientPoints < 1) {
                        console.log(`Client ${client_id} ran out of solo points. Stopping bulk creation.`);
                        break;
                    }
                    
                    // Check if the time slot exists and is available for this coach on this date
                    const [availabilityCheck] = await connection.execute(`
                        SELECT id, start_time, end_time FROM coach_availability 
                        WHERE coach_id = ? AND date = ? AND start_time = ? AND is_booked = 0
                    `, [coach_id, dateStr, time_slot]);
                    
                    if (availabilityCheck.length > 0) {
                        // Slot exists and is available, create the reservation
                        try {
                            const selectedSlot = availabilityCheck[0];
                            
                            // Create the reservation
                            const [reservationResult] = await connection.execute(`
                                INSERT INTO reservations (coach_id, full_name, email, phone, age, gender, goal, date, time, created_by, user_id, status, reservation_type)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, 'confirmed', 'individual')
                            `, [
                                coach_id, 
                                client.full_name, 
                                client.email, 
                                client.phone, 
                                client.age, 
                                client.gender, 
                                client.goal, 
                                dateStr, 
                                time_slot,
                                client_id
                            ]);
                            
                            // Mark the selected slot and any overlapping slots as booked
                            const overlappingSlotsCount = await markOverlappingSlots(
                                connection,
                                coach_id,
                                dateStr,
                                selectedSlot.start_time,
                                selectedSlot.end_time,
                                reservationResult.insertId  // Pass the reservation ID
                            );
                            
                            // Deduct solo points from client
                            await connection.execute(`
                                UPDATE users 
                                SET points = points - 1, solo_points = solo_points - 1 
                                WHERE id = ?
                            `, [client_id]);
                            
                            clientPoints--; // Update our local counter
                            
                            createdReservations.push({
                                id: reservationResult.insertId,
                                coach_id: parseInt(coach_id),
                                coach_name: coach.name,
                                full_name: client.full_name,
                                email: client.email,
                                phone: client.phone,
                                age: client.age,
                                gender: client.gender,
                                goal: client.goal,
                                date: dateStr,
                                time: time_slot,
                                status: 'confirmed',
                                reservation_type: 'individual',
                                created_at: new Date(),
                                user_id: parseInt(client_id)
                            });
                            
                            console.log(`Created reservation for ${dateStr} at ${time_slot} (blocked ${overlappingSlotsCount} overlapping slots)`);
                            
                        } catch (reservationError) {
                            console.error(`Failed to create reservation for ${dateStr}:`, reservationError);
                            skippedSlots.push({
                                date: dateStr,
                                time: time_slot,
                                reason: 'Failed to create reservation'
                            });
                        }
                    } else {
                        // Slot doesn't exist or is already booked
                        skippedSlots.push({
                            date: dateStr,
                            time: time_slot,
                            reason: 'Time slot not available or already booked'
                        });
                        console.log(`Skipped ${dateStr} at ${time_slot} - slot not available`);
                    }
                }
            }
            
            // Move to next day
            iterationDate.setDate(iterationDate.getDate() + 1);
        }

        await connection.commit();
        connection.release();
        
        console.log(`Bulk reservation creation completed: ${createdReservations.length} reservations created, ${skippedSlots.length} slots skipped`);
        
        // Send email notifications if reservations were created
        if (createdReservations.length > 0) {
            console.log('Sending bulk reservation email notifications...');
            
            // Prepare email data
            const emailData = {
                clientName: client.full_name || client.username,
                clientEmail: client.email,
                coachName: coach.name,
                coachEmail: coach.email,
                startDate: start_date,
                endDate: end_date,
                timeSlot: time_slot,
                daysOfWeek: days_of_week,
                reservations: createdReservations,
                remainingPoints: clientPoints
            };
            
            // Send email to client (don't wait for completion to avoid blocking response)
            sendBulkReservationConfirmation(emailData).then((clientEmailSent) => {
                if (clientEmailSent) {
                    console.log('✅ Bulk reservation confirmation email sent to client successfully');
                } else {
                    console.log('❌ Failed to send bulk reservation confirmation email to client');
                }
            }).catch((error) => {
                console.error('Error sending bulk reservation confirmation email to client:', error);
            });
            
            // Send email to coach (don't wait for completion to avoid blocking response)
            sendBulkCoachNotification(emailData).then((coachEmailSent) => {
                if (coachEmailSent) {
                    console.log('✅ Bulk reservation notification email sent to coach successfully');
                } else {
                    console.log('❌ Failed to send bulk reservation notification email to coach');
                }
            }).catch((error) => {
                console.error('Error sending bulk reservation notification email to coach:', error);
            });
            
            console.log('Email notifications dispatched (processing in background)');
        }
        
        res.status(201).json({
            message: 'Bulk reservations created successfully',
            reservations: createdReservations,
            created_count: createdReservations.length,
            skipped: skippedSlots.length,
            skipped_details: skippedSlots,
            client_remaining_points: clientPoints,
            email_notifications: createdReservations.length > 0 ? 'sent' : 'not_applicable'
        });
        
    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('Error during rollback:', rollbackError);
        }
        console.error('Error creating bulk reservations:', error);
        res.status(500).json({ 
            error: 'Failed to create bulk reservations',
            message: error.message 
        });
    } finally {
        connection.release();
    }
});

module.exports = router;
